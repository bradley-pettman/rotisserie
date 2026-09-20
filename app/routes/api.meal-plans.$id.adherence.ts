/**
 * Resource route: /api/meal-plans/:id/adherence  (GET)
 *
 * Planned vs. actually cooked, from the plan-to-cook integration layer. The
 * unfulfilled items come back alongside the counts because "which three meals
 * did we skip" is the question that follows "we hit 4 of 7", and both come
 * from the same module.
 */
import type { Route } from "./+types/api.meal-plans.$id.adherence";
import {
  getPlanAdherence,
  getUnfulfilledItems,
} from "~/features/integrations/plan-to-cook";
import { getMealPlanById } from "~/features/meal-plans/queries/meal-plans";
import {
  apiRoute,
  assertApiAccess,
  jsonOk,
  methodNotAllowedHandler,
  requireFound,
  uuidPathParam,
} from "~/lib/api";

export const loader = apiRoute(async ({ request, params }: Route.LoaderArgs) => {
  assertApiAccess(request);

  const planId = uuidPathParam(params.id, "Meal plan");

  // getPlanAdherence reports zeroes for a plan id that matches nothing, which
  // is right for an empty plan but wrong for a missing one. The plan is looked
  // up first so a bad id is a 404 rather than a confident "0 of 0".
  requireFound(await getMealPlanById(planId), "Meal plan not found");

  const [adherence, unfulfilledItems] = await Promise.all([
    getPlanAdherence(planId),
    getUnfulfilledItems(planId),
  ]);

  return jsonOk({ ...adherence, unfulfilledItems });
});

/** GET-only: keep the 405 in the same JSON envelope as everything else. */
export const action = methodNotAllowedHandler(["GET"]);
