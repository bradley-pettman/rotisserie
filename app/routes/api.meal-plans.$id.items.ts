/**
 * Resource route: /api/meal-plans/:id/items  (POST -- assign a meal)
 *
 * A meal plan item is either recipe-backed (`recipeId`) or free text
 * (`customText`); mealPlanItemSchema enforces that at least one is present.
 */
import type { Route } from "./+types/api.meal-plans.$id.items";
import {
  assignMeal,
  getMealPlanById,
} from "~/features/meal-plans/queries/meal-plans";
import { mealPlanItemSchema } from "~/features/meal-plans/schemas/meal-plan";
import {
  apiRoute,
  assertApiAccess,
  jsonOk,
  methodNotAllowed,
  methodNotAllowedHandler,
  parseOrThrow,
  readJsonBody,
  requireFound,
  uuidPathParam,
} from "~/lib/api";

export const action = apiRoute(async ({ request, params }: Route.ActionArgs) => {
  assertApiAccess(request);

  const planId = uuidPathParam(params.id, "Meal plan");

  if (request.method !== "POST") {
    return methodNotAllowed(request, ["POST"]);
  }

  const item = parseOrThrow(mealPlanItemSchema, await readJsonBody(request));

  // assignMeal would fail the meal_plan_id foreign key for an unknown plan,
  // which reads as a 400. An unknown plan in the PATH is a 404, so the plan is
  // looked up first. The query module offers no cheaper existence check than
  // fetching the plan and all of its items.
  requireFound(await getMealPlanById(planId), "Meal plan not found");

  const created = await assignMeal(planId, item);

  return jsonOk(created, 201, {
    Location: `/api/meal-plan-items/${created.id}`,
  });
});

/** POST-only: a GET here must be our 405, not React Router's stack trace. */
export const loader = methodNotAllowedHandler(["POST"]);
