/**
 * Resource route: /api/deletions  (GET)
 *
 * "What has been deleted since I last synced?" -- the question a cache cannot
 * answer for itself. Every other endpoint here reports what exists, and a row
 * that stops appearing is indistinguishable, from the outside, from one that
 * was filtered out, paged past, or lost to a failed request. Without this a
 * client that has ever held a recipe or a plan item can only stay correct by
 * downloading the whole library again.
 *
 * The rows come from `deletions`, written by AFTER DELETE triggers rather than
 * by any query module -- see 20260920130000 for why that is load-bearing, and
 * in short: `meal_plan_items.recipe_id` is ON DELETE CASCADE, so deleting a
 * recipe removes plan items with no application code running at all.
 *
 * THE SYNC LOOP this endpoint is shaped for:
 *
 *   1. hold a cursor -- the newest `deletedAt` you have applied
 *   2. GET /api/deletions?since=<cursor>&offset=0
 *   3. apply every tombstone: drop that id from that table's cache
 *   4. while the page came back full, re-ask with offset += data.length
 *   5. advance the cursor to the newest `deletedAt` you received
 *
 * `since` IS INCLUSIVE, and step 5 is why. Every tombstone written by one
 * DELETE shares a timestamp, because NOW() is transaction start time -- a
 * recipe and the plan items that cascaded with it are stamped identically. An
 * exclusive bound would silently drop the rest of that group whenever a cursor
 * landed on it. Inclusive can only re-send a tombstone that was already
 * applied, and forgetting a row you have already forgotten is a no-op.
 *
 * `offset` exists for the case `since` alone cannot page: one cascade can
 * write more tombstones at a single timestamp than `limit` returns, and a
 * client that only ever advanced `since` would then receive the same page
 * forever. Step 4 terminates because the table is append-mostly and read
 * oldest-first, so rows written during the walk land after the window.
 *
 * ONE HAZARD WORTH A SAFETY MARGIN. A tombstone is stamped when its
 * transaction STARTED but becomes visible only when it COMMITS, so a slow
 * delete can publish a row whose timestamp already sits behind a cursor that
 * moved on in the meantime. The transactions here are a DELETE and its
 * cascades, bounded by a 10s `statement_timeout`, so the window is small but
 * it is not zero. A client that rewinds its cursor by a few seconds on each
 * pass closes it for free -- re-applying a tombstone costs nothing, which is
 * exactly what makes the conservative direction the cheap one.
 *
 * WHAT THIS ENDPOINT DOES NOT TELL YOU, and the client-side rule that covers
 * it. `cooks.recipe_id` is ON DELETE SET NULL, so deleting a recipe MUTATES
 * surviving cooks rather than deleting them, and `cooks` carries no
 * `updated_at` to advertise the change -- no tombstone will ever mention those
 * rows. It does not corrupt anything on screen: history renders from the
 * snapshot `cooks.label` and never joins to `recipes`, so a cook reads
 * identically before and after. The only thing a stale `recipeId` can do is
 * convince a client the recipe still exists. So: WHEN YOU APPLY A `recipes`
 * TOMBSTONE, ALSO NULL ANY CACHED `cooks.recipeId` POINTING AT THAT ID. The
 * information is already in this response; the client is just performing
 * locally what the foreign key did on the server.
 */
import { z } from "zod";
import type { Route } from "./+types/api.deletions";
import { countDeletions, listDeletions } from "~/db/deletions";
import {
  apiRoute,
  assertApiAccess,
  intSearchParam,
  jsonCached,
  methodNotAllowedHandler,
  parseOrThrow,
} from "~/lib/api";

/**
 * A tombstone is three short fields, so the ceiling is about round trips
 * rather than bytes -- 500 of them is roughly 40KB. The default is bounded
 * (unlike `limit` on /api/recipes, which has no honest default because that
 * endpoint's historical behaviour is "every matching row"): this response is
 * a page of an append-only log with no natural end, and handing back an
 * unbounded one would mean a first sync after a long quiet period arriving as
 * a single enormous body.
 */
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;
const MAX_OFFSET = 1_000_000;

/**
 * `since` is an INSTANT, and the validator is strict about it on purpose.
 *
 * A bare '2026-09-20' is rejected rather than read as midnight, because
 * midnight *where* is exactly the ambiguity this codebase has fought twice in
 * the other direction -- calendar days are kept as strings precisely so that
 * nothing attaches a timezone to them (see the DATE note in CLAUDE.md). A
 * deletion, unlike a planned meal, happens at a moment rather than on a day,
 * so the honest input is the `deletedAt` the client was given back, verbatim.
 * `{ offset: true }` accepts '+02:00' as well as 'Z', since a client formatting
 * an ISO-8601 instant locally will often emit the former.
 *
 * A present-but-empty `?since=` is a 400 rather than "no cursor", which is
 * deliberately unlike `intSearchParam`'s reading of a blank value as "use the
 * fallback". The failure actually worth guarding is a client that interpolated
 * an empty variable into the URL, and answering THAT with every tombstone on
 * file looks like success while being the opposite of what was asked.
 */
const sinceSchema = z.object({ since: z.iso.datetime({ offset: true }) });

/**
 * GET /api/deletions?since=2026-09-20T18:00:00.000Z&limit=200&offset=0
 *
 * `since` is optional: absent means every tombstone still on file, which is
 * the answer for a client that lost its cursor and wants to know what it
 * missed rather than refetching the library.
 *
 * ETagged, and the fit is better here than anywhere else in this API. The
 * normal answer to this question is "nothing" -- a polling client asks on
 * every foreground and almost always finds an empty page -- and a client that
 * keeps its cursor fixed until something actually arrives is asking for the
 * same URL each time, which is the precondition for a 304. The ordering is
 * total (`deleted_at, table_name, row_id`, and the last two are the primary
 * key), so the validator is stable for unchanged data rather than turning over
 * with whatever row order the planner felt like.
 *
 * `meta.total` is the number of tombstones matching `since`, not the number on
 * this page, so a client can tell a truncated page from the last one without
 * a second request. `limit` and `offset` are echoed unconditionally, unlike
 * /api/recipes where they are omitted when the caller left them out: this
 * response is always bounded, so both always have a real value to report.
 */
export const loader = apiRoute(async ({ request }: Route.LoaderArgs) => {
  assertApiAccess(request);

  const url = new URL(request.url);
  const rawSince = url.searchParams.get("since");

  const since =
    rawSince === null
      ? undefined
      : new Date(
          parseOrThrow(
            sinceSchema,
            { since: rawSince },
            'Query parameter "since" must be an ISO-8601 instant, e.g. ' +
              "2026-09-20T18:00:00.000Z"
          ).since
        );

  const limit = intSearchParam(url, "limit", DEFAULT_LIMIT, {
    min: 1,
    max: MAX_LIMIT,
  });
  const offset = intSearchParam(url, "offset", 0, { min: 0, max: MAX_OFFSET });

  // Concurrent, as on /api/recipes: the count does not need the page and the
  // page does not need the count, so running them serially would spend a round
  // trip on a number nobody waits for. The two statements are not one
  // snapshot, so `total` can disagree with the page by a row under a
  // concurrent delete -- harmless here, because the next pass picks up
  // whatever arrived and applying a tombstone twice is a no-op.
  const [deletions, total] = await Promise.all([
    listDeletions({ since, limit, offset }),
    countDeletions(since),
  ]);

  return jsonCached(request, deletions, { total, limit, offset });
});

/** GET-only: keep the 405 in the same JSON envelope as everything else. */
export const action = methodNotAllowedHandler(["GET"]);
