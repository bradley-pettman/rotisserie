import type { CookedMealSchemas } from '@rotisserie/shared/meals'
import type { RecipeSchemas } from '@rotisserie/shared/recipes'
import { uniq } from 'lodash-es'
import { DB, type QueryFns } from '~/db/connection'
import { strict } from './errors'
import { decodeCursor, encodeCursor, isoDate, isoTimestamp } from './sql'

const COOKED_MEAL_SELECT = `
  SELECT
    cm.id,
    cm.planned_meal_id AS "plannedMealId",
    ${isoDate('cm.cooked_on')} AS "cookedOn",
    cm.meal_slot AS "mealSlot",
    cm.headcount,
    cm.notes,
    cm.star_rating AS "starRating",
    ${isoDate('cm.settled_on')} AS "settledOn",
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

async function fetchCookedMeal(
  db: QueryFns,
  householdId: string,
  id: string
): Promise<CookedMealSchemas['CookedMeal'] | null> {
  return db.queryOne<CookedMealSchemas['CookedMeal']>(`${COOKED_MEAL_SELECT} WHERE cm.household_id = $1 AND cm.id = $2`, [
    householdId,
    id
  ])
}

export async function upsertCookedMeal(
  householdId: string,
  input: CookedMealSchemas['CookedMealInput']
): Promise<CookedMealSchemas['CookedMeal'] | null> {
  return DB.withTransaction(async (tx) => {
    const recipeIdsNeedingLabels = uniq(
      input.dishes.flatMap((dish) => (dish.label === undefined && dish.recipeId !== null ? [dish.recipeId] : []))
    )
    const recipes =
      recipeIdsNeedingLabels.length === 0
        ? []
        : await tx.query<{ id: string; name: string }>(
            `SELECT id, name FROM recipes WHERE household_id = $1 AND id = ANY($2::uuid[])`,
            [householdId, recipeIdsNeedingLabels]
          )
    const saved = await tx.queryOne<{ id: string }>(
      `INSERT INTO cooked_meals (id, household_id, planned_meal_id, cooked_on, meal_slot, headcount, notes, star_rating)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         planned_meal_id = EXCLUDED.planned_meal_id,
         cooked_on = EXCLUDED.cooked_on,
         meal_slot = EXCLUDED.meal_slot,
         headcount = EXCLUDED.headcount,
         notes = EXCLUDED.notes,
         star_rating = EXCLUDED.star_rating,
         settled_on = NULL
       WHERE cooked_meals.household_id = EXCLUDED.household_id
       RETURNING id`,
      [
        input.id,
        householdId,
        input.plannedMealId,
        input.cookedOn,
        input.mealSlot,
        input.headcount,
        input.notes,
        input.starRating
      ]
    )
    if (saved === null) return null

    const dishes = input.dishes.map((dish, index) => ({
      recipe_id: dish.recipeId,
      label: dish.label ?? recipes.find((recipe) => recipe.id === dish.recipeId)?.name ?? null,
      is_leftovers: dish.isLeftovers,
      notes: dish.notes,
      sort_order: index
    }))
    await tx.query(`DELETE FROM cooked_meal_dishes WHERE cooked_meal_id = $1`, [input.id])
    await tx.query(
      `INSERT INTO cooked_meal_dishes (household_id, cooked_meal_id, recipe_id, label, is_leftovers, notes, sort_order)
       SELECT $1, $2, x.recipe_id, x.label, x.is_leftovers, x.notes, x.sort_order
       FROM jsonb_to_recordset($3::jsonb) AS x(recipe_id uuid, label text, is_leftovers boolean, notes text, sort_order int)`,
      [householdId, input.id, JSON.stringify(dishes)]
    )

    const meal = await fetchCookedMeal(tx, householdId, input.id)
    if (meal === null) throw new Error(`Cooked meal ${input.id} missing after upsert`)
    return meal
  })
}

export const upsertCookedMealStrict = strict(upsertCookedMeal, 'Cooked meal')

export async function settlePlannedMealsBefore(
  householdId: string,
  before: string
): Promise<CookedMealSchemas['CookedMeal'][]> {
  return DB.withTransaction(async (tx) => {
    const settled = await tx.query<{ id: string }>(
      `WITH due AS (
         SELECT pm.id, pm.planned_on, pm.meal_slot, pm.headcount
         FROM planned_meals pm
         WHERE pm.household_id = $1
           AND pm.planned_on < $2::date
           AND EXISTS (SELECT 1 FROM planned_meal_dishes d WHERE d.planned_meal_id = pm.id)
           AND NOT EXISTS (SELECT 1 FROM cooked_meals cm WHERE cm.planned_meal_id = pm.id)
           AND NOT EXISTS (
             SELECT 1
             FROM cooked_meals cm
             WHERE cm.household_id = pm.household_id AND cm.cooked_on = pm.planned_on AND cm.meal_slot = pm.meal_slot
           )
       ),
       inserted AS (
         INSERT INTO cooked_meals (household_id, planned_meal_id, cooked_on, meal_slot, headcount, settled_on)
         SELECT $1, id, planned_on, meal_slot, headcount, $2::date FROM due
         ON CONFLICT (planned_meal_id) DO NOTHING
         RETURNING id, planned_meal_id
       ),
       dishes AS (
         INSERT INTO cooked_meal_dishes (household_id, cooked_meal_id, recipe_id, label, notes, sort_order)
         SELECT $1, i.id, d.recipe_id, COALESCE(r.name, d.custom_text), d.notes, d.sort_order
         FROM inserted i
         JOIN planned_meal_dishes d ON d.planned_meal_id = i.planned_meal_id
         LEFT JOIN recipes r ON r.id = d.recipe_id
       )
       SELECT id FROM inserted`,
      [householdId, before]
    )
    if (settled.length === 0) return []

    return tx.query<CookedMealSchemas['CookedMeal']>(
      `${COOKED_MEAL_SELECT}
       WHERE cm.household_id = $1 AND cm.id = ANY($2::uuid[])
       ORDER BY cm.cooked_on, array_position(ARRAY['breakfast', 'lunch', 'dinner', 'snack']::text[], cm.meal_slot::text)`,
      [householdId, settled.map((meal) => meal.id)]
    )
  })
}

export async function getCookedMeal(householdId: string, id: string): Promise<CookedMealSchemas['CookedMeal'] | null> {
  return fetchCookedMeal(DB, householdId, id)
}

export const getCookedMealStrict = strict(getCookedMeal, 'Cooked meal')

export async function listCookedMealsWithinDateRange(
  householdId: string,
  cookedFrom: string,
  cookedTo: string
): Promise<CookedMealSchemas['CookedMeal'][]> {
  return DB.query<CookedMealSchemas['CookedMeal']>(
    `${COOKED_MEAL_SELECT}
     WHERE cm.household_id = $1 AND cm.cooked_on BETWEEN $2::date AND $3::date
     ORDER BY cm.cooked_on, array_position(ARRAY['breakfast', 'lunch', 'dinner', 'snack']::text[], cm.meal_slot::text), cm.created_at`,
    [householdId, cookedFrom, cookedTo]
  )
}

export async function listCookedMeals(
  householdId: string,
  options: {
    cursor?: string
    limit: number
  }
): Promise<CookedMealSchemas['CookedMealPage']> {
  const [cursorCookedOn = null, cursorId = null] = options.cursor === undefined ? [] : decodeCursor(options.cursor, 2)
  const rows = await DB.query<CookedMealSchemas['CookedMeal']>(
    `${COOKED_MEAL_SELECT}
     WHERE cm.household_id = $4 AND ($1::date IS NULL OR (cm.cooked_on, cm.id) < ($1::date, $2::uuid))
     ORDER BY cm.cooked_on DESC, cm.id DESC
     LIMIT $3`,
    [cursorCookedOn, cursorId, options.limit + 1, householdId]
  )

  const meals = rows.slice(0, options.limit)
  const last = meals.at(-1)
  const nextCursor = rows.length > options.limit && last ? encodeCursor([last.cookedOn, last.id]) : null
  return { meals, nextCursor }
}

export async function deleteCookedMeal(householdId: string, id: string): Promise<{ id: string } | null> {
  return DB.queryOne<{ id: string }>(`DELETE FROM cooked_meals WHERE household_id = $1 AND id = $2 RETURNING id`, [
    householdId,
    id
  ])
}

export const deleteCookedMealStrict = strict(deleteCookedMeal, 'Cooked meal')

export type RecipeStatsRow = RecipeSchemas['RecipeStats'] & { recipeId: string }

export async function listRecipeStats(householdId: string, recipeIds: string[]): Promise<RecipeStatsRow[]> {
  if (recipeIds.length === 0) return []

  return DB.query<RecipeStatsRow>(
    `SELECT
       s.recipe_id AS "recipeId",
       ROUND(s.average_rating, 1) AS "averageRating",
       s.rating_count AS "ratingCount",
       s.times_made AS "timesMade",
       ${isoDate('s.last_made_on')} AS "lastMadeOn"
     FROM recipe_stats s
     JOIN recipes r ON r.id = s.recipe_id
     WHERE r.household_id = $1 AND s.recipe_id = ANY($2::uuid[])`,
    [householdId, uniq(recipeIds)]
  )
}
