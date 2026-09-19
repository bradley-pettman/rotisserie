/**
 * Resource route: /api/meal-plan-items/:itemId  (PATCH -- move, DELETE)
 *
 * Items are addressed by their own id rather than nested under their plan:
 * removeMealPlanItem and moveMealPlanItem both identify them that way, and the
 * id is globally unique.
 */
import type { Route } from "./+types/api.meal-plan-items.$itemId";
import {
  moveMealPlanItem,
  removeMealPlanItem,
} from "~/features/meal-plans/queries/meal-plans";
import { moveMealPlanItemSchema } from "~/features/meal-plans/schemas/meal-plan";
import {
  apiRoute,
  assertApiAccess,
  jsonError,
  jsonOk,
  methodNotAllowed,
  methodNotAllowedHandler,
  noContent,
  parseOrThrow,
  readJsonBody,
  requireFound,
  uuidPathParam,
} from "~/lib/api";

export const action = apiRoute(async ({ request, params }: Route.ActionArgs) => {
  assertApiAccess(request);

  const itemId = uuidPathParam(params.itemId, "Meal plan item");

  switch (request.method) {
    /**
     * PATCH -- the planner's most common edit: a meal shifts days.
     *
     * Only the day and the slot move. The recipe, the notes and the plan the
     * item belongs to are not editable here because `moveMealPlanItem` does
     * not touch them, and anything already cooked against this item keeps both
     * its own date and its fulfilment -- moving an intention does not rewrite
     * a fact.
     */
    case "PATCH": {
      const move = parseOrThrow(
        moveMealPlanItemSchema,
        await readJsonBody(request)
      );

      return jsonOk(
        requireFound(
          await moveMealPlanItem(itemId, move.plannedOn, move.mealSlot),
          "Meal plan item not found"
        )
      );
    }

    case "DELETE": {
      if (!(await removeMealPlanItem(itemId))) {
        throw jsonError(404, "Meal plan item not found");
      }

      return noContent();
    }

    default:
      return methodNotAllowed(request, ["PATCH", "DELETE"]);
  }
});

/** No single-item read in the query module: the plan carries its items. */
export const loader = methodNotAllowedHandler(["PATCH", "DELETE"]);
