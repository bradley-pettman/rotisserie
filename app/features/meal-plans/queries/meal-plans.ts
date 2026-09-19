import { DB } from "~/db/connection";
import type { QueryFns } from "~/db/connection";
import type { CreateMealPlanInput, MealPlanItemInput, MealSlot } from "../schemas/meal-plan";

export interface MealPlan {
  id: string;
  name: string | null;
  startsOn: string;
  endsOn: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MealPlanItem {
  id: string;
  mealPlanId: string;
  // recipeId is a RAW id and stays raw. This module never joins to `recipes`:
  // doing so would couple the planner to the recipe book and break the rule
  // that a meal plan works with no recipes at all. Turning this id into a name
  // is the caller's job.
  recipeId: string | null;
  customText: string | null;
  plannedOn: string;
  mealSlot: MealSlot;
  sortOrder: number;
  notes: string | null;
}

export interface MealPlanWithItems extends MealPlan {
  items: MealPlanItem[];
}

// DATE columns come back from `pg` as JS Date objects pinned to local midnight,
// which silently shifts the day either side of UTC. These are calendar dates,
// not instants, so render them in SQL and keep them as 'YYYY-MM-DD' strings --
// the same shape the Zod schemas accept. to_char rather than ::text so the
// result does not depend on the server's DateStyle.
const PLAN_COLUMNS = `id, name,
            to_char(starts_on, 'YYYY-MM-DD') as "startsOn",
            to_char(ends_on, 'YYYY-MM-DD') as "endsOn",
            created_at as "createdAt", updated_at as "updatedAt"`;

const ITEM_COLUMNS = `id, meal_plan_id as "mealPlanId", recipe_id as "recipeId",
            custom_text as "customText",
            to_char(planned_on, 'YYYY-MM-DD') as "plannedOn",
            meal_slot as "mealSlot", sort_order as "sortOrder", notes`;

/**
 * Plan items sort by the day, then by the order the meals happen IN that day,
 * then by the caller's explicit ordering. Sorting on the raw meal_slot string
 * would be alphabetical -- breakfast, dinner, lunch, snack -- which puts
 * dinner before lunch. A constant, never interpolated with caller input.
 *
 * Exported for the integration layer, which lists plan items too and must not
 * drift from this ordering. `meal_slot` is left unqualified so it drops into
 * either module's aliasing; use it only where meal_plan_items is the single
 * source of that column in the query.
 */
export const MEAL_SLOT_SQL_ORDER = `CASE meal_slot
             WHEN 'breakfast' THEN 0
             WHEN 'lunch' THEN 1
             WHEN 'dinner' THEN 2
             WHEN 'snack' THEN 3
             ELSE 4
           END`;

export async function createMealPlan(
  input: CreateMealPlanInput,
  items: MealPlanItemInput[] = []
): Promise<MealPlan> {
  return DB.withTransaction(async (tx) => {
    const plan = await tx.queryOne<MealPlan>(
      `INSERT INTO meal_plans (name, starts_on, ends_on)
       VALUES ($1, $2, $3)
       RETURNING ${PLAN_COLUMNS}`,
      [input.name ?? null, input.startsOn, input.endsOn]
    );

    if (!plan) throw new Error("Failed to create meal plan");

    await insertMealPlanItems(tx, plan.id, items);

    return plan;
  });
}

async function insertMealPlanItems(
  tx: QueryFns,
  planId: string,
  items: MealPlanItemInput[]
): Promise<void> {
  for (const item of items) {
    await tx.query(
      `INSERT INTO meal_plan_items
         (meal_plan_id, recipe_id, custom_text, planned_on, meal_slot, sort_order, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        planId,
        item.recipeId,
        item.customText,
        item.plannedOn,
        item.mealSlot,
        item.sortOrder,
        item.notes,
      ]
    );
  }
}

export async function getMealPlanById(id: string): Promise<MealPlanWithItems | null> {
  const plan = await DB.queryOne<MealPlan>(
    `SELECT ${PLAN_COLUMNS} FROM meal_plans WHERE id = $1`,
    [id]
  );

  if (!plan) return null;

  const items = await DB.query<MealPlanItem>(
    `SELECT ${ITEM_COLUMNS}
     FROM meal_plan_items
     WHERE meal_plan_id = $1
     ORDER BY planned_on, ${MEAL_SLOT_SQL_ORDER}, sort_order`,
    [id]
  );

  return { ...plan, items };
}

export async function listMealPlans(): Promise<MealPlan[]> {
  return DB.query<MealPlan>(
    `SELECT ${PLAN_COLUMNS} FROM meal_plans ORDER BY created_at DESC`
  );
}

export async function assignMeal(
  planId: string,
  item: MealPlanItemInput
): Promise<MealPlanItem> {
  const created = await DB.queryOne<MealPlanItem>(
    `INSERT INTO meal_plan_items
       (meal_plan_id, recipe_id, custom_text, planned_on, meal_slot, sort_order, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${ITEM_COLUMNS}`,
    [
      planId,
      item.recipeId,
      item.customText,
      item.plannedOn,
      item.mealSlot,
      item.sortOrder,
      item.notes,
    ]
  );

  if (!created) throw new Error("Failed to assign meal");

  return created;
}

export async function removeMealPlanItem(itemId: string): Promise<boolean> {
  const result = await DB.query(
    `DELETE FROM meal_plan_items WHERE id = $1 RETURNING id`,
    [itemId]
  );
  return result.length > 0;
}

/**
 * Moving a plan item rewrites the INTENT only. Any cook already recorded
 * against it keeps its own date -- see cook_fulfillments.
 */
export async function moveMealPlanItem(
  itemId: string,
  plannedOn: string,
  mealSlot: MealSlot
): Promise<MealPlanItem | null> {
  return DB.queryOne<MealPlanItem>(
    `UPDATE meal_plan_items
     SET planned_on = $2, meal_slot = $3
     WHERE id = $1
     RETURNING ${ITEM_COLUMNS}`,
    [itemId, plannedOn, mealSlot]
  );
}

export async function deleteMealPlan(id: string): Promise<boolean> {
  const result = await DB.query(
    `DELETE FROM meal_plans WHERE id = $1 RETURNING id`,
    [id]
  );
  return result.length > 0;
}
