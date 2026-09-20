/**
 * Resource route: /api/meal-plans  (GET list, POST create)
 */
import { z } from "zod";
import type { Route } from "./+types/api.meal-plans";
import {
  createMealPlan,
  findPlanCovering,
  getMealPlanById,
  listMealPlans,
} from "~/features/meal-plans/queries/meal-plans";
import {
  createMealPlanSchema,
  mealPlanItemSchema,
} from "~/features/meal-plans/schemas/meal-plan";
import {
  apiRoute,
  assertApiAccess,
  jsonCached,
  jsonOk,
  methodNotAllowed,
  parseOrThrow,
  readJsonBody,
  requireFound,
} from "~/lib/api";

// Composed from the existing item schema, not a redefinition of it:
// createMealPlan takes the plan and its items as two arguments, so the single
// JSON body is split along the same seam before being handed over.
// Bounded: `createMealPlan` inserts these one at a time inside a single
// transaction, so an unbounded array lets one request hold a pooled connection
// (there are ten) for as long as it likes. A month of four slots a day is
// ~124 items, so 500 is generous for any real plan.
const mealPlanItemsSchema = z.array(mealPlanItemSchema).max(500).default([]);

/**
 * `?covering=` is a CALENDAR DAY and stays a string from here to the WHERE
 * clause. Nothing in this path constructs a Date, deliberately.
 *
 * It reuses `z.iso.date()` -- the same validator `createMealPlanSchema` puts
 * on `startsOn` and `endsOn` -- rather than a hand-rolled pattern, because a
 * `\d{4}-\d{2}-\d{2}` regex accepts 2026-02-30 and 2026-13-01, which then
 * reach Postgres and come back as a 22008 the caller reads as a mysterious
 * 400 about "a malformed date or time" with no parameter named. `z.iso.date()`
 * rejects both here, where the message can say which parameter was wrong.
 *
 * It also refuses a full ISO instant, and that matters more than it looks.
 * Accepting "2026-09-20T00:00:00Z" would invite clients to send a Date, and
 * the timezone riding along on that Date is precisely how a plan for Tuesday
 * gets looked up on Monday west of UTC -- the same bug the query layer already
 * fought twice by rendering DATE columns with to_char. The narrow validator
 * keeps that invariant from being negotiable at the network edge.
 */
const coveringSchema = z.object({ covering: z.iso.date() });

/**
 * GET /api/meal-plans
 * GET /api/meal-plans?covering=2026-09-20
 *
 * "What is planned for today?" is the home-screen and widget question.
 * `findPlanCovering` has answered it in process since the planner shipped,
 * with no way for anything off-box to ask.
 *
 * THE RESPONSE IS AN ARRAY IN BOTH CASES -- zero or one element when
 * filtered. This is the part not to "simplify" into a bare object or a null.
 * An endpoint whose response SHAPE depends on a query parameter costs a typed
 * client two models, two decode paths and a branch at every call site; for
 * the Swift `Codable` client this API is being widened for, `[MealPlan]`
 * decodes both calls and `covering` becomes a filter rather than a different
 * endpoint wearing the same URL. The saving being traded away is two
 * characters of JSON.
 *
 * For the same reason "no plan covers that day" is a 200 with `[]` and never
 * a 404: the collection exists and was read successfully, a filter simply
 * matched nothing -- exactly like an empty library. A 404 would be
 * indistinguishable, to the client, from a typo in the path or a route that
 * failed to deploy, and it is the widget's NORMAL answer on any day nobody
 * has planned yet.
 *
 * The array has a second payoff worth naming, because it is the one that
 * decides whether this ages well. Nothing in the schema prevents two plans
 * from covering the same day, and `findPlanCovering` resolves that by taking
 * the newest -- "the one you just made is the one you meant". If that ever
 * needs to become "every plan covering the day", it is a change of CONTENT
 * inside a shape clients already decode, rather than a second breaking change
 * to an endpoint that had committed to returning one object.
 *
 * The element is the plain `MealPlan` row, items not included, because that
 * is what the unfiltered list returns and one decoder has to serve both. A
 * caller that wants the meals follows up with
 * GET /api/meal-plans/:id?include=recipeNames -- one more round trip, and it
 * keeps the names opt-in on the endpoint that knows how to resolve them in a
 * single batched query.
 */
export const loader = apiRoute(async ({ request }: Route.LoaderArgs) => {
  assertApiAccess(request);

  const url = new URL(request.url);
  const covering = url.searchParams.get("covering");

  if (covering === null) return jsonCached(request, await listMealPlans());

  // A PRESENT-BUT-EMPTY `?covering=` is a 400 rather than "no filter", which
  // is deliberately unlike `intSearchParam`'s reading of a blank value as
  // "use the fallback". There is no honest fallback day, and the failure
  // actually worth guarding is a client that interpolated an empty variable
  // into the URL: answering THAT with every plan ever made looks like success
  // and is the opposite of what was asked. `parseOrThrow` puts the offending
  // value under `details.covering`, so the 400 names the parameter.
  const { covering: day } = parseOrThrow(
    coveringSchema,
    { covering },
    'Query parameter "covering" must be a calendar day in YYYY-MM-DD form'
  );

  const plan = await findPlanCovering(day);

  return jsonCached(request, plan === null ? [] : [plan]);
});

/**
 * POST /api/meal-plans
 *
 * Body is the plan fields plus an optional `items` array. Items are optional
 * because an empty plan is a legitimate plan -- assign meals later via
 * POST /api/meal-plans/:id/items.
 */
export const action = apiRoute(async ({ request }: Route.ActionArgs) => {
  assertApiAccess(request);

  if (request.method !== "POST") {
    return methodNotAllowed(request, ["GET", "POST"]);
  }

  const body = await readJsonBody(request);

  const plan = parseOrThrow(createMealPlanSchema, body);
  const items = parseOrThrow(
    mealPlanItemsSchema,
    (body as { items?: unknown }).items ?? [],
    'Request field "items" failed validation'
  );

  const created = await createMealPlan(plan, items);

  // createMealPlan returns the plan row without its items; re-read so the 201
  // body shows what was actually stored, in the planner's own ordering.
  const full = requireFound(await getMealPlanById(created.id), "Meal plan not found");

  // A 201 is deliberately NOT jsonCached: an ETag is for a read a client will
  // ask for again, and this body is the answer to a write that happened once.
  return jsonOk(full, 201, { Location: `/api/meal-plans/${full.id}` });
});
