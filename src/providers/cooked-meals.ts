import type { CookedMealSchemas, MealSlot } from '@rotisserie/shared/meals'
import { uniq } from 'lodash-es'
import { DB, type QueryFns } from '~/db/connection'
import { decodeCursor, encodeCursor, isoDate, isoTimestamp } from './sql'

export type CookedDishInput = {
  recipeId: string | null
  label?: string
  isLeftovers: boolean
  notes: string | null
}

export type CookedMealInput = {
  id: string
  plannedMealId: string | null
  cookedOn: string
  mealSlot: MealSlot
  headcount: number | null
  notes: string | null
  dishes: CookedDishInput[]
}

export type CookedMealPage = {
  meals: CookedMealSchemas['CookedMeal'][]
  nextCursor: string | null
}

const COOKED_MEAL_SELECT = `
  SELECT
    cm.id,
    cm.planned_meal_id AS "plannedMealId",
    ${isoDate('cm.cooked_on')} AS "cookedOn",
    cm.meal_slot AS "mealSlot",
    cm.headcount,
    cm.notes,
    ${isoTimestamp('cm.created_at')} AS "createdAt",
    COALESCE(
      (
        SELECT json_agg(
          json_build_object(
            'id', d.id,
            'recipeId', d.recipe_id,
            'label', d.label,
            'isLeftovers', d.is_leftovers,
            'notes', d.notes,
            'sortOrder', d.sort_order
          )
          ORDER BY d.sort_order, d.id
        )
        FROM cooked_meal_dishes d
        WHERE d.cooked_meal_id = cm.id
      ),
      '[]'::json
    ) AS dishes
  FROM cooked_meals cm`

async function fetchCookedMeal(db: QueryFns, id: string): Promise<CookedMealSchemas['CookedMeal'] | null> {
  return db.queryOne<CookedMealSchemas['CookedMeal']>(`${COOKED_MEAL_SELECT} WHERE cm.id = $1`, [id])
}

export async function upsertCookedMeal(input: CookedMealInput): Promise<CookedMealSchemas['CookedMeal']> {
  return DB.withTransaction(async (tx) => {
    const recipeIdsNeedingLabels = uniq(
      input.dishes.flatMap((dish) => (dish.label === undefined && dish.recipeId !== null ? [dish.recipeId] : []))
    )
    const recipes =
      recipeIdsNeedingLabels.length === 0
        ? []
        : await tx.query<{ id: string; name: string }>(`SELECT id, name FROM recipes WHERE id = ANY($1::uuid[])`, [
            recipeIdsNeedingLabels
          ])
    await tx.query(
      `INSERT INTO cooked_meals (id, planned_meal_id, cooked_on, meal_slot, headcount, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         planned_meal_id = EXCLUDED.planned_meal_id,
         cooked_on = EXCLUDED.cooked_on,
         meal_slot = EXCLUDED.meal_slot,
         headcount = EXCLUDED.headcount,
         notes = EXCLUDED.notes`,
      [input.id, input.plannedMealId, input.cookedOn, input.mealSlot, input.headcount, input.notes]
    )

    const dishes = input.dishes.map((dish, index) => ({
      recipe_id: dish.recipeId,
      label: dish.label ?? recipes.find((recipe) => recipe.id === dish.recipeId)?.name ?? null,
      is_leftovers: dish.isLeftovers,
      notes: dish.notes,
      sort_order: index
    }))
    await tx.query(`DELETE FROM cooked_meal_dishes WHERE cooked_meal_id = $1`, [input.id])
    await tx.query(
      `INSERT INTO cooked_meal_dishes (cooked_meal_id, recipe_id, label, is_leftovers, notes, sort_order)
       SELECT $1, x.recipe_id, x.label, x.is_leftovers, x.notes, x.sort_order
       FROM jsonb_to_recordset($2::jsonb) AS x(recipe_id uuid, label text, is_leftovers boolean, notes text, sort_order int)`,
      [input.id, JSON.stringify(dishes)]
    )

    const meal = await fetchCookedMeal(tx, input.id)
    if (meal === null) throw new Error(`Cooked meal ${input.id} missing after upsert`)
    return meal
  })
}

export async function getCookedMeal(id: string): Promise<CookedMealSchemas['CookedMeal'] | null> {
  return fetchCookedMeal(DB, id)
}

export async function listCookedMealsWithinDateRange(
  cookedFrom: string,
  cookedTo: string
): Promise<CookedMealSchemas['CookedMeal'][]> {
  return DB.query<CookedMealSchemas['CookedMeal']>(
    `${COOKED_MEAL_SELECT}
     WHERE cm.cooked_on BETWEEN $1::date AND $2::date
     ORDER BY cm.cooked_on, array_position(ARRAY['breakfast', 'lunch', 'dinner', 'snack']::text[], cm.meal_slot::text), cm.created_at`,
    [cookedFrom, cookedTo]
  )
}

export async function listCookedMeals(options: { cursor?: string; limit: number }): Promise<CookedMealPage> {
  const [cursorCookedOn = null, cursorId = null] = options.cursor === undefined ? [] : decodeCursor(options.cursor, 2)
  const rows = await DB.query<CookedMealSchemas['CookedMeal']>(
    `${COOKED_MEAL_SELECT}
     WHERE $1::date IS NULL OR (cm.cooked_on, cm.id) < ($1::date, $2::uuid)
     ORDER BY cm.cooked_on DESC, cm.id DESC
     LIMIT $3`,
    [cursorCookedOn, cursorId, options.limit + 1]
  )

  const meals = rows.slice(0, options.limit)
  const last = meals.at(-1)
  const nextCursor = rows.length > options.limit && last ? encodeCursor([last.cookedOn, last.id]) : null
  return { meals, nextCursor }
}

export async function deleteCookedMeal(id: string): Promise<boolean> {
  const rows = await DB.query<{ id: string }>(`DELETE FROM cooked_meals WHERE id = $1 RETURNING id`, [id])
  return rows.length > 0
}

export type LastMade = {
  recipeId: string
  cookedOn: string
}

export async function lastMade(recipeIds: string[]): Promise<LastMade[]> {
  if (recipeIds.length === 0) return []

  return DB.query<LastMade>(
    `SELECT d.recipe_id AS "recipeId", ${isoDate('MAX(cm.cooked_on)')} AS "cookedOn"
     FROM cooked_meal_dishes d
     JOIN cooked_meals cm ON cm.id = d.cooked_meal_id
     WHERE d.recipe_id = ANY($1::uuid[]) AND NOT d.is_leftovers
     GROUP BY d.recipe_id`,
    [recipeIds]
  )
}
