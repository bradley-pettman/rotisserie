import type { MealSlot, PlannedMealSchemas } from '@rotisserie/shared/meals'
import { DB, type QueryFns } from '~/db/connection'
import { isoDate, isoTimestamp } from './sql'

export type PlannedDishInput = {
  id: string
  recipeId: string | null
  customText: string | null
  notes: string | null
}

export type PlannedMealInput = {
  id: string
  plannedOn: string
  mealSlot: MealSlot
  headcount: number | null
  notes: string | null
  dishes: PlannedDishInput[]
}

const PLANNED_MEAL_SELECT = `
  SELECT
    pm.id,
    ${isoDate('pm.planned_on')} AS "plannedOn",
    pm.meal_slot AS "mealSlot",
    pm.headcount,
    pm.notes,
    ${isoTimestamp('pm.created_at')} AS "createdAt",
    ${isoTimestamp('pm.updated_at')} AS "updatedAt",
    COALESCE(
      (
        SELECT json_agg(
          json_build_object(
            'id', d.id,
            'recipe', CASE WHEN r.id IS NULL THEN NULL ELSE json_build_object(
                'id', r.id,
                'name', r.name,
                'instructions', r.instructions,
                'prepTimeMinutes', r.prep_time_minutes,
                'cookTimeMinutes', r.cook_time_minutes,
                'servings', r.servings,
                'sourceUrl', r.source_url,
                'notes', r.notes,
                'createdAt', ${isoTimestamp('r.created_at')},
                'updatedAt', ${isoTimestamp('r.updated_at')}
              ) END,
            'customText', d.custom_text,
            'notes', d.notes,
            'sortOrder', d.sort_order
          )
          ORDER BY d.sort_order, d.id
        )
        FROM planned_meal_dishes d
        LEFT JOIN recipes r ON r.id = d.recipe_id
        WHERE d.planned_meal_id = pm.id
      ),
      '[]'::json
    ) AS dishes
  FROM planned_meals pm`

async function fetchPlannedMeal(db: QueryFns, id: string): Promise<PlannedMealSchemas['PlannedMeal'] | null> {
  return db.queryOne<PlannedMealSchemas['PlannedMeal']>(`${PLANNED_MEAL_SELECT} WHERE pm.id = $1`, [id])
}

async function fetchPlannedMealOrThrow(db: QueryFns, id: string): Promise<PlannedMealSchemas['PlannedMeal']> {
  const meal = await fetchPlannedMeal(db, id)
  if (meal === null) throw new Error(`Planned meal ${id} missing after write`)
  return meal
}

export async function listPlannedMealsWithinDateRange(
  plannedFrom: string,
  plannedTo: string
): Promise<PlannedMealSchemas['PlannedMeal'][]> {
  return DB.query<PlannedMealSchemas['PlannedMeal']>(
    `${PLANNED_MEAL_SELECT}
     WHERE pm.planned_on BETWEEN $1::date AND $2::date
     ORDER BY pm.planned_on, array_position(ARRAY['breakfast', 'lunch', 'dinner', 'snack']::text[], pm.meal_slot::text)`,
    [plannedFrom, plannedTo]
  )
}

export async function getPlannedMeal(id: string): Promise<PlannedMealSchemas['PlannedMeal'] | null> {
  return fetchPlannedMeal(DB, id)
}

export async function upsertPlannedMeal(input: PlannedMealInput): Promise<PlannedMealSchemas['PlannedMeal']> {
  return DB.withTransaction(async (tx) => {
    await tx.query(
      `INSERT INTO planned_meals (id, planned_on, meal_slot, headcount, notes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         planned_on = EXCLUDED.planned_on,
         meal_slot = EXCLUDED.meal_slot,
         headcount = EXCLUDED.headcount,
         notes = EXCLUDED.notes,
         updated_at = NOW()`,
      [input.id, input.plannedOn, input.mealSlot, input.headcount, input.notes]
    )

    const dishes = input.dishes.map((dish, index) => ({
      id: dish.id,
      recipe_id: dish.recipeId,
      custom_text: dish.customText,
      notes: dish.notes,
      sort_order: index
    }))
    await tx.query(`DELETE FROM planned_meal_dishes WHERE planned_meal_id = $1`, [input.id])
    await tx.query(
      `INSERT INTO planned_meal_dishes (id, planned_meal_id, recipe_id, custom_text, notes, sort_order)
       SELECT x.id, $1, x.recipe_id, x.custom_text, x.notes, x.sort_order
       FROM jsonb_to_recordset($2::jsonb) AS x(id uuid, recipe_id uuid, custom_text text, notes text, sort_order int)`,
      [input.id, JSON.stringify(dishes)]
    )

    return fetchPlannedMealOrThrow(tx, input.id)
  })
}

export async function deletePlannedMeal(id: string): Promise<boolean> {
  const rows = await DB.query<{ id: string }>(`DELETE FROM planned_meals WHERE id = $1 RETURNING id`, [id])
  return rows.length > 0
}

export async function addPlannedDish(
  plannedMealId: string,
  dish: PlannedDishInput
): Promise<PlannedMealSchemas['PlannedMeal'] | null> {
  return DB.withTransaction(async (tx) => {
    const meal = await tx.queryOne<{ id: string }>(`SELECT id FROM planned_meals WHERE id = $1 FOR UPDATE`, [plannedMealId])
    if (meal === null) return null

    await tx.query(
      `INSERT INTO planned_meal_dishes (id, planned_meal_id, recipe_id, custom_text, notes, sort_order)
       SELECT $1, $2, $3, $4, $5, COALESCE(MAX(sort_order) + 1, 0)
       FROM planned_meal_dishes
       WHERE planned_meal_id = $2`,
      [dish.id, plannedMealId, dish.recipeId, dish.customText, dish.notes]
    )
    await tx.query(`UPDATE planned_meals SET updated_at = NOW() WHERE id = $1`, [plannedMealId])

    return fetchPlannedMealOrThrow(tx, plannedMealId)
  })
}

export async function removePlannedDish(dishId: string): Promise<PlannedMealSchemas['PlannedMeal'] | null> {
  return DB.withTransaction(async (tx) => {
    const removed = await tx.queryOne<{ plannedMealId: string }>(
      `DELETE FROM planned_meal_dishes WHERE id = $1 RETURNING planned_meal_id AS "plannedMealId"`,
      [dishId]
    )
    if (removed === null) return null

    await tx.query(`UPDATE planned_meals SET updated_at = NOW() WHERE id = $1`, [removed.plannedMealId])

    return fetchPlannedMealOrThrow(tx, removed.plannedMealId)
  })
}
