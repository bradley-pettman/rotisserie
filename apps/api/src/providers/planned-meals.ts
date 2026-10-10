import type { PlannedMealSchemas } from '@rotisserie/shared/meals'
import { DB, type QueryFns } from '~/db/connection'
import { strict } from './errors'
import { isoDate, isoTimestamp } from './sql'

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

async function fetchPlannedMeal(
  db: QueryFns,
  householdId: string,
  id: string
): Promise<PlannedMealSchemas['PlannedMeal'] | null> {
  return db.queryOne<PlannedMealSchemas['PlannedMeal']>(`${PLANNED_MEAL_SELECT} WHERE pm.household_id = $1 AND pm.id = $2`, [
    householdId,
    id
  ])
}

async function fetchPlannedMealOrThrow(
  db: QueryFns,
  householdId: string,
  id: string
): Promise<PlannedMealSchemas['PlannedMeal']> {
  const meal = await fetchPlannedMeal(db, householdId, id)
  if (meal === null) throw new Error(`Planned meal ${id} missing after write`)
  return meal
}

export async function listPlannedMealsWithinDateRange(
  householdId: string,
  plannedFrom: string,
  plannedTo: string
): Promise<PlannedMealSchemas['PlannedMeal'][]> {
  return DB.query<PlannedMealSchemas['PlannedMeal']>(
    `${PLANNED_MEAL_SELECT}
     WHERE pm.household_id = $1 AND pm.planned_on BETWEEN $2::date AND $3::date
     ORDER BY pm.planned_on, array_position(ARRAY['breakfast', 'lunch', 'dinner', 'snack']::text[], pm.meal_slot::text)`,
    [householdId, plannedFrom, plannedTo]
  )
}

export async function listUnscheduledPlannedMeals(householdId: string): Promise<PlannedMealSchemas['PlannedMeal'][]> {
  return DB.query<PlannedMealSchemas['PlannedMeal']>(
    `${PLANNED_MEAL_SELECT}
     WHERE pm.household_id = $1
       AND pm.planned_on IS NULL
       AND NOT EXISTS (SELECT 1 FROM cooked_meals cm WHERE cm.planned_meal_id = pm.id)
     ORDER BY pm.created_at, pm.id`,
    [householdId]
  )
}

export async function getPlannedMeal(householdId: string, id: string): Promise<PlannedMealSchemas['PlannedMeal'] | null> {
  return fetchPlannedMeal(DB, householdId, id)
}

export const getPlannedMealStrict = strict(getPlannedMeal, 'Planned meal')

export async function upsertPlannedMeal(
  householdId: string,
  input: PlannedMealSchemas['PlannedMealInput']
): Promise<PlannedMealSchemas['PlannedMeal'] | null> {
  return DB.withTransaction(async (tx) => {
    const saved = await tx.queryOne<{ id: string }>(
      `INSERT INTO planned_meals (id, household_id, planned_on, meal_slot, headcount, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         planned_on = EXCLUDED.planned_on,
         meal_slot = EXCLUDED.meal_slot,
         headcount = EXCLUDED.headcount,
         notes = EXCLUDED.notes,
         updated_at = NOW()
       WHERE planned_meals.household_id = EXCLUDED.household_id
       RETURNING id`,
      [input.id, householdId, input.plannedOn, input.mealSlot, input.headcount, input.notes]
    )
    if (saved === null) return null

    const dishes = input.dishes.map((dish, index) => ({
      id: dish.id,
      recipe_id: dish.recipeId,
      custom_text: dish.customText,
      notes: dish.notes,
      sort_order: index
    }))
    await tx.query(`DELETE FROM planned_meal_dishes WHERE planned_meal_id = $1`, [input.id])
    await tx.query(
      `INSERT INTO planned_meal_dishes (id, household_id, planned_meal_id, recipe_id, custom_text, notes, sort_order)
       SELECT x.id, $1, $2, x.recipe_id, x.custom_text, x.notes, x.sort_order
       FROM jsonb_to_recordset($3::jsonb) AS x(id uuid, recipe_id uuid, custom_text text, notes text, sort_order int)`,
      [householdId, input.id, JSON.stringify(dishes)]
    )

    return fetchPlannedMealOrThrow(tx, householdId, input.id)
  })
}

export const upsertPlannedMealStrict = strict(upsertPlannedMeal, 'Planned meal')

export async function deletePlannedMeal(householdId: string, id: string): Promise<{ id: string } | null> {
  return DB.queryOne<{ id: string }>(`DELETE FROM planned_meals WHERE household_id = $1 AND id = $2 RETURNING id`, [
    householdId,
    id
  ])
}

export const deletePlannedMealStrict = strict(deletePlannedMeal, 'Planned meal')

export async function addPlannedDish(
  householdId: string,
  plannedMealId: string,
  dish: PlannedMealSchemas['PlannedDishInput']
): Promise<PlannedMealSchemas['PlannedMeal'] | null> {
  return DB.withTransaction(async (tx) => {
    const meal = await tx.queryOne<{ id: string }>(
      `SELECT id FROM planned_meals WHERE household_id = $1 AND id = $2 FOR UPDATE`,
      [householdId, plannedMealId]
    )
    if (meal === null) return null

    await tx.query(
      `INSERT INTO planned_meal_dishes (id, household_id, planned_meal_id, recipe_id, custom_text, notes, sort_order)
       SELECT $1, $2, $3, $4, $5, $6, COALESCE(MAX(sort_order) + 1, 0)
       FROM planned_meal_dishes
       WHERE planned_meal_id = $3`,
      [dish.id, householdId, plannedMealId, dish.recipeId, dish.customText, dish.notes]
    )
    await tx.query(`UPDATE planned_meals SET updated_at = NOW() WHERE id = $1`, [plannedMealId])

    return fetchPlannedMealOrThrow(tx, householdId, plannedMealId)
  })
}

export const addPlannedDishStrict = strict(addPlannedDish, 'Planned meal')

export async function removePlannedDish(
  householdId: string,
  dishId: string
): Promise<PlannedMealSchemas['PlannedMeal'] | null> {
  return DB.withTransaction(async (tx) => {
    const removed = await tx.queryOne<{ plannedMealId: string }>(
      `DELETE FROM planned_meal_dishes WHERE household_id = $1 AND id = $2 RETURNING planned_meal_id AS "plannedMealId"`,
      [householdId, dishId]
    )
    if (removed === null) return null

    await tx.query(`UPDATE planned_meals SET updated_at = NOW() WHERE id = $1`, [removed.plannedMealId])

    return fetchPlannedMealOrThrow(tx, householdId, removed.plannedMealId)
  })
}

export const removePlannedDishStrict = strict(removePlannedDish, 'Dish')
