/**
 * Resource route: /api/meal-plans/:id  (GET, DELETE)
 */
import type { Route } from "./+types/api.meal-plans.$id";
import {
  deleteMealPlan,
  getMealPlanById,
} from "~/features/meal-plans/queries/meal-plans";
import {
  apiRoute,
  assertApiAccess,
  jsonError,
  jsonOk,
  methodNotAllowed,
  noContent,
  requireFound,
  uuidPathParam,
} from "~/lib/api";

export const loader = apiRoute(async ({ request, params }: Route.LoaderArgs) => {
  assertApiAccess(request);

  const id = uuidPathParam(params.id, "Meal plan");

  return jsonOk(requireFound(await getMealPlanById(id), "Meal plan not found"));
});

export const action = apiRoute(async ({ request, params }: Route.ActionArgs) => {
  assertApiAccess(request);

  const id = uuidPathParam(params.id, "Meal plan");

  if (request.method !== "DELETE") {
    return methodNotAllowed(request, ["GET", "DELETE"]);
  }

  if (!(await deleteMealPlan(id))) throw jsonError(404, "Meal plan not found");

  return noContent();
});
