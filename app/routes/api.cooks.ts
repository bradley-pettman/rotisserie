/**
 * Resource route: /api/cooks  (GET history, POST log)
 *
 * A cook is append-only fact. There is no PATCH here because the query module
 * offers no update -- rewriting history is not a supported operation.
 */
import type { Route } from "./+types/api.cooks";
import {
  getCookingHistory,
  logCookWithOutcome,
} from "~/features/recipes/queries/cooks";
import { createCookSchema } from "~/features/recipes/schemas/cook";
import {
  apiRoute,
  assertApiAccess,
  intSearchParam,
  jsonOk,
  methodNotAllowed,
  parseOrThrow,
  readJsonBody,
  requireFound,
} from "~/lib/api";

/** GET /api/cooks?days=30 -- everything cooked in the last N days, newest first. */
export const loader = apiRoute(async ({ request }: Route.LoaderArgs) => {
  assertApiAccess(request);

  const days = intSearchParam(new URL(request.url), "days", 30, {
    min: 1,
    max: 3650,
  });

  return jsonOk(await getCookingHistory(days));
});

/**
 * POST /api/cooks
 *
 * `label` is optional: omit it with a `recipeId` and logCook snapshots that
 * recipe's current name into the cook, inside the insert's own transaction. A
 * client holding an id and no name can therefore log a cook without reading
 * the recipe first. Omitting both is the one combination logCook cannot serve,
 * and createCookSchema rejects it as a 400.
 *
 * IDEMPOTENT WHEN THE BODY CARRIES AN `id`. This was the one write in the API
 * that a client could not safely retry. Everything else is either naturally
 * idempotent (PATCH a plan item's date) or made so on purpose (PUT a
 * fulfilment, which is `ON CONFLICT DO NOTHING` for exactly this reason). A
 * cook is append-only fact with no PATCH, so a request that succeeded with its
 * response lost left an offline queue choosing between dropping a cook and
 * writing a second one -- and a duplicate is not cosmetic: it over-counts
 * `getPlanAdherence` and pollutes the window the planner reads to answer
 * "nothing we've had in two weeks". Naming the row up front makes the retry
 * land on the original.
 *
 *   201  this request created the row
 *   200  the id was already stored; the body is the row as first written, and
 *        nothing was changed
 *
 * Both carry the stored cook, so a client that ignores the distinction is
 * still correct. The split exists because 201 is a claim that this request
 * created something: repeating it would make a replay indistinguishable from a
 * genuine double-write in a log, and that distinction is the only way an id
 * being reused for two different meals ever becomes visible.
 */
export const action = apiRoute(async ({ request }: Route.ActionArgs) => {
  assertApiAccess(request);

  if (request.method !== "POST") {
    return methodNotAllowed(request, ["GET", "POST"]);
  }

  const input = parseOrThrow(createCookSchema, await readJsonBody(request));

  // `logCookWithOutcome` answers null when the body names a recipe that does
  // not exist. That is a 404, the same as every other "you referenced a
  // missing row" in this API -- it used to be an uncaught Error and therefore
  // a 500.
  const { cook, created } = requireFound(
    await logCookWithOutcome(input),
    "Recipe not found"
  );

  return jsonOk(cook, created ? 201 : 200);
});
