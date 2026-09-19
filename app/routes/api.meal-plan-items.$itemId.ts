/**
 * Resource route: /api/meal-plan-items/:itemId  (DELETE)
 *
 * Items are addressed by their own id rather than nested under their plan:
 * removeMealPlanItem identifies them that way, and the id is globally unique.
 */
import type { Route } from "./+types/api.meal-plan-items.$itemId";
import { removeMealPlanItem } from "~/features/meal-plans/queries/meal-plans";
import {
  apiRoute,
  assertApiAccess,
  jsonError,
  methodNotAllowed,
  methodNotAllowedHandler,
  noContent,
  uuidPathParam,
} from "~/lib/api";

export const action = apiRoute(async ({ request, params }: Route.ActionArgs) => {
  assertApiAccess(request);

  const itemId = uuidPathParam(params.itemId, "Meal plan item");

  if (request.method !== "DELETE") {
    return methodNotAllowed(request, ["DELETE"]);
  }

  if (!(await removeMealPlanItem(itemId))) {
    throw jsonError(404, "Meal plan item not found");
  }

  return noContent();
});

/** DELETE-only: a GET here must be our 405, not React Router's stack trace. */
export const loader = methodNotAllowedHandler(["DELETE"]);
