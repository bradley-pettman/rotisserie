/**
 * INTEGRATION LAYER: meal plans <-> cooks.
 *
 * The boundary rule this file exists to serve: feature modules must work
 * standalone and no feature module may import another. Dependencies point
 * down -- to shared tables and to ~/db/connection -- never sideways. So
 * `app/features/meal-plans/**` knows nothing about recipes or cooks (it holds
 * recipe ids as raw UUIDs and never joins to them), and the recipe book knows
 * nothing about the planner.
 *
 * Something still has to connect the two: the planner records INTENT ("tacos,
 * Tuesday") and the recipe book records FACT ("cooked tacos, Monday"). Rather
 * than let one module reach into the other, that link lives in its own table,
 * `cook_fulfillments`, owned here. This is the ONLY file permitted to import
 * from two feature modules, and the only code that touches that table.
 *
 * The consequence is the point: delete this file and its migration and you
 * drop one table. Both modules keep working, neither loses a column, and
 * every meal plan and every cook survives intact.
 *
 * The link is optional on both sides -- a plan item may never be cooked, and
 * a cook may fulfil nothing -- and the two dates stay independent. A plan item
 * for Tuesday fulfilled by a Monday cook is a normal, fully-recorded outcome,
 * not a discrepancy to reconcile. Nothing here compares planned_on to
 * cooked_on, because neither date is wrong.
 */
import { DB } from "~/db/connection";
import { MEAL_SLOT_SQL_ORDER } from "~/features/meal-plans/queries/meal-plans";
import type { MealPlanItem } from "~/features/meal-plans/queries/meal-plans";

export interface PlanAdherence {
  planned: number;
  cooked: number;
  unfulfilled: number;
}

/**
 * Record that a cook fulfilled a plan item. Idempotent: re-recording the same
 * pair is a no-op, so this is safe to call from a retried form submission.
 */
export async function fulfilPlanItem(
  cookId: string,
  mealPlanItemId: string
): Promise<void> {
  await DB.query(
    `INSERT INTO cook_fulfillments (cook_id, meal_plan_item_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [cookId, mealPlanItemId]
  );
}

/**
 * Unlink a cook from a plan item. Removes only the link -- the cook and the
 * plan item both survive, which is the whole reason the link is its own table.
 */
export async function unfulfilPlanItem(
  cookId: string,
  mealPlanItemId: string
): Promise<boolean> {
  const result = await DB.query(
    `DELETE FROM cook_fulfillments
     WHERE cook_id = $1 AND meal_plan_item_id = $2
     RETURNING cook_id`,
    [cookId, mealPlanItemId]
  );
  return result.length > 0;
}

export async function getPlanAdherence(planId: string): Promise<PlanAdherence> {
  // COUNT(DISTINCT ...) on both sides, because the join fans out: one plan
  // item can carry several fulfilments (a second batch later in the week).
  // Plain COUNT(*) would then inflate `planned` along with `cooked` and report
  // more meals planned than the plan contains.
  //
  // ::int because COUNT returns bigint, which `pg` hands back as a string.
  const adherence = await DB.queryOne<PlanAdherence>(
    `SELECT COUNT(DISTINCT mpi.id)::int AS planned,
            COUNT(DISTINCT cf.meal_plan_item_id)::int AS cooked,
            (COUNT(DISTINCT mpi.id) - COUNT(DISTINCT cf.meal_plan_item_id))::int AS unfulfilled
     FROM meal_plan_items mpi
     LEFT JOIN cook_fulfillments cf ON cf.meal_plan_item_id = mpi.id
     WHERE mpi.meal_plan_id = $1`,
    [planId]
  );

  // A plan with no items -- or an id that matches nothing -- is zero of each,
  // not an error.
  return adherence ?? { planned: 0, cooked: 0, unfulfilled: 0 };
}

/**
 * Plan items that were never cooked. Returns the planner's own row shape,
 * recipeId included as a raw id: resolving it to a recipe name is still the
 * caller's job, even here.
 */
export async function getUnfulfilledItems(planId: string): Promise<MealPlanItem[]> {
  return DB.query<MealPlanItem>(
    `SELECT mpi.id, mpi.meal_plan_id as "mealPlanId", mpi.recipe_id as "recipeId",
            mpi.custom_text as "customText",
            to_char(mpi.planned_on, 'YYYY-MM-DD') as "plannedOn",
            mpi.meal_slot as "mealSlot", mpi.sort_order as "sortOrder", mpi.notes
     FROM meal_plan_items mpi
     WHERE mpi.meal_plan_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM cook_fulfillments cf WHERE cf.meal_plan_item_id = mpi.id
       )
     ORDER BY mpi.planned_on, ${MEAL_SLOT_SQL_ORDER}, mpi.sort_order`,
    [planId]
  );
}
