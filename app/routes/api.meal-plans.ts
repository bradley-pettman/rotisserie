/**
 * Resource route: /api/meal-plans  (GET list, POST create)
 */
import { z } from "zod";
import type { Route } from "./+types/api.meal-plans";
import {
  createMealPlan,
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

export const loader = apiRoute(async ({ request }: Route.LoaderArgs) => {
  assertApiAccess(request);

  return jsonOk(await listMealPlans());
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

  return jsonOk(full, 201, { Location: `/api/meal-plans/${full.id}` });
});
