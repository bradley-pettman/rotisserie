/**
 * Resource route: /api/meal-plan-items/:itemId/fulfillments/:cookId
 * (PUT to link, DELETE to unlink)
 *
 * This is the missing half of the intent/fact split. A plan item is an
 * INTENTION ("tacos, Tuesday"), a cook is a FACT ("cooked tacos, Monday"), and
 * a row in `cook_fulfillments` is the only thing that says the second
 * satisfied the first. Without it `/adherence` reports `cooked: 0` forever,
 * however much actually gets cooked. Neither date moves when the link is made:
 * the Tuesday intention and the Monday fact both stay true, which is exactly
 * why the link is its own row rather than a column on either side.
 *
 * SHAPE. The link is addressed by BOTH of its ends, because that pair is its
 * whole identity -- `cook_fulfillments` is keyed on (cook_id,
 * meal_plan_item_id) and has no surrogate id to put in a URL. It hangs under
 * the plan item because the item is the thing whose fulfilment is in question
 * and the thing `/adherence` counts; the relationship is many-to-many in both
 * directions (one item can take several cooks, one cook can cover several
 * items), so a singular `/fulfillment` subresource would have misdescribed it.
 *
 * PUT, not POST, because `fulfilPlanItem` is `ON CONFLICT DO NOTHING` and PUT
 * is the method that already means "make this exist, and say the same thing if
 * it already does". A repeat call is a 204 just like the first, so a retrying
 * client needs no special case. There is no body: both ids are in the path and
 * the row has no other columns.
 */
import type { Route } from "./+types/api.meal-plan-items.$itemId.fulfillments.$cookId";
import {
  fulfilPlanItem,
  unfulfilPlanItem,
} from "~/features/integrations/plan-to-cook";
import {
  apiRoute,
  assertApiAccess,
  jsonError,
  methodNotAllowed,
  methodNotAllowedHandler,
  noContent,
  requireReferences,
  uuidPathParam,
} from "~/lib/api";

/**
 * Both ids come from the path, so a miss on either is a 404 -- not the 400 a
 * bare foreign-key violation would produce, and certainly not a 500. Postgres
 * decides, because there is no read that could rule it out without racing the
 * insert.
 */
const NOT_FOUND_BY_CONSTRAINT = {
  cook_fulfillments_cook_id_fkey: "Cook not found",
  cook_fulfillments_meal_plan_item_id_fkey: "Meal plan item not found",
};

export const action = apiRoute(async ({ request, params }: Route.ActionArgs) => {
  assertApiAccess(request);

  const itemId = uuidPathParam(params.itemId, "Meal plan item");
  const cookId = uuidPathParam(params.cookId, "Cook");

  switch (request.method) {
    case "PUT": {
      await requireReferences(
        () => fulfilPlanItem(cookId, itemId),
        NOT_FOUND_BY_CONSTRAINT
      );

      return noContent();
    }

    case "DELETE": {
      // Unlike PUT, this one is not idempotent-by-nature: deleting a link that
      // was never there is a 404, the same answer any other missing resource
      // gets. The cook and the plan item both survive -- only the link goes.
      if (!(await unfulfilPlanItem(cookId, itemId))) {
        throw jsonError(404, "Fulfilment not found");
      }

      return noContent();
    }

    default:
      return methodNotAllowed(request, ["PUT", "DELETE"]);
  }
});

/**
 * No GET: `plan-to-cook` exposes fulfilment per PLAN (`/adherence`, which
 * carries the unfulfilled items), never per link, and this route adds no
 * query of its own.
 */
export const loader = methodNotAllowedHandler(["PUT", "DELETE"]);
