import type { MealSlot } from '@rotisserie/shared/meals'
import type {
  GrocerySchemas,
  GrocerySection,
  IngredientSection,
  ItemDefault,
  ShoppableMeal
} from '@rotisserie/shared/groceries'
import { DB } from '~/db/connection'
import { strict } from './errors'
import { isoTimestamp } from './sql'

type GroceryLine = GrocerySchemas['GroceryLine']

export type StoredGroceryItem = GrocerySchemas['GroceryItem'] & { line: GroceryLine | null }

export type ListedMeal = {
  id: string
  plannedMealId: string | null
  label: string
  lines: GroceryLine[]
  addedAt: string
}

export type PlannedMealForList = Omit<ShoppableMeal, 'dishes'> & {
  id: string
  mealSlot: MealSlot
  cooked: boolean
  dishes: (ShoppableMeal['dishes'][number] & { name: string })[]
}

export type GroceryItemWrite = {
  id: string
  text: string
  checked: boolean
  sortOrder: number
  storeId: string | null
  section: GrocerySection | null
}

export type GroceryChanges = {
  updates: { id: string; text: string; line: GroceryLine }[]
  inserts: { text: string; line: GroceryLine; storeId: string | null; section: GrocerySection | null }[]
  meals: { plannedMealId: string; label: string; lines: GroceryLine[] }[]
  removeMealIds: string[]
}

const ITEM_COLUMNS = `
  id,
  text,
  checked_at IS NOT NULL AS checked,
  sort_order AS "sortOrder",
  store_id AS "storeId",
  section,
  line,
  COALESCE(line->'dishes', '[]'::jsonb) AS dishes,
  COALESCE(line->'meals', '[]'::jsonb) AS "mealIds",
  ${isoTimestamp('created_at')} AS "createdAt",
  ${isoTimestamp('updated_at')} AS "updatedAt"`

export async function listGroceryItems(householdId: string): Promise<StoredGroceryItem[]> {
  return DB.query<StoredGroceryItem>(
    `SELECT ${ITEM_COLUMNS} FROM grocery_items WHERE household_id = $1 ORDER BY sort_order, created_at, id`,
    [householdId]
  )
}

export async function getGroceryItem(householdId: string, id: string): Promise<StoredGroceryItem | null> {
  return DB.queryOne<StoredGroceryItem>(`SELECT ${ITEM_COLUMNS} FROM grocery_items WHERE household_id = $1 AND id = $2`, [
    householdId,
    id
  ])
}

export async function upsertGroceryItem(householdId: string, input: GroceryItemWrite): Promise<StoredGroceryItem | null> {
  return DB.queryOne<StoredGroceryItem>(
    `INSERT INTO grocery_items (id, household_id, text, checked_at, sort_order, store_id, section)
     VALUES ($1, $2, $3, CASE WHEN $4::boolean THEN NOW() END, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE SET
       text = EXCLUDED.text,
       line = CASE WHEN grocery_items.text = EXCLUDED.text THEN grocery_items.line END,
       checked_at = CASE WHEN $4::boolean THEN COALESCE(grocery_items.checked_at, NOW()) END,
       sort_order = EXCLUDED.sort_order,
       store_id = EXCLUDED.store_id,
       section = EXCLUDED.section,
       updated_at = NOW()
     WHERE grocery_items.household_id = EXCLUDED.household_id
     RETURNING ${ITEM_COLUMNS}`,
    [input.id, householdId, input.text, input.checked, input.sortOrder, input.storeId, input.section]
  )
}

export const upsertGroceryItemStrict = strict(upsertGroceryItem, 'Grocery item')

export async function deleteGroceryItem(householdId: string, id: string): Promise<{ id: string } | null> {
  return DB.queryOne<{ id: string }>(`DELETE FROM grocery_items WHERE household_id = $1 AND id = $2 RETURNING id`, [
    householdId,
    id
  ])
}

export const deleteGroceryItemStrict = strict(deleteGroceryItem, 'Grocery item')

export async function uncheckAllGroceryItems(householdId: string): Promise<void> {
  await DB.query(
    `UPDATE grocery_items SET checked_at = NULL, updated_at = NOW() WHERE household_id = $1 AND checked_at IS NOT NULL`,
    [householdId]
  )
}

export async function deleteCheckedGroceryItems(householdId: string): Promise<void> {
  await DB.query(`DELETE FROM grocery_items WHERE household_id = $1 AND checked_at IS NOT NULL`, [householdId])
}

const LISTED_MEAL_COLUMNS = `
  id,
  planned_meal_id AS "plannedMealId",
  label,
  lines,
  ${isoTimestamp('added_at')} AS "addedAt"`

export async function listListedMeals(householdId: string): Promise<ListedMeal[]> {
  return DB.query<ListedMeal>(
    `SELECT ${LISTED_MEAL_COLUMNS} FROM grocery_list_meals WHERE household_id = $1 ORDER BY added_at, id`,
    [householdId]
  )
}

export async function getListedMeal(householdId: string, id: string): Promise<ListedMeal | null> {
  return DB.queryOne<ListedMeal>(
    `SELECT ${LISTED_MEAL_COLUMNS} FROM grocery_list_meals WHERE household_id = $1 AND id = $2`,
    [householdId, id]
  )
}

export const getListedMealStrict = strict(getListedMeal, 'Grocery alert')

export async function listPlannedMealsForList(householdId: string, ids: string[]): Promise<PlannedMealForList[]> {
  if (ids.length === 0) return []
  return DB.query<PlannedMealForList>(
    `SELECT
       pm.id,
       pm.meal_slot AS "mealSlot",
       pm.headcount,
       EXISTS (SELECT 1 FROM cooked_meals cm WHERE cm.planned_meal_id = pm.id) AS cooked,
       COALESCE(
         (
           SELECT json_agg(
             json_build_object(
               'name', COALESCE(r.name, d.custom_text),
               'customText', d.custom_text,
               'recipe', CASE WHEN r.id IS NULL THEN NULL ELSE json_build_object(
                 'name', r.name,
                 'servings', r.servings,
                 'ingredients', COALESCE(
                   (
                     SELECT json_agg(
                       json_build_object(
                         'ingredient', json_build_object('id', i.id, 'name', i.name),
                         'quantity', ri.quantity,
                         'unit', CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object(
                           'id', u.id,
                           'name', u.name,
                           'abbreviation', u.abbreviation,
                           'category', u.category
                         ) END
                       )
                       ORDER BY ri.sort_order, ri.id
                     )
                     FROM recipe_ingredients ri
                     JOIN ingredients i ON i.id = ri.ingredient_id
                     LEFT JOIN units u ON u.id = ri.unit_id
                     WHERE ri.recipe_id = r.id
                   ),
                   '[]'::json
                 )
               ) END
             )
             ORDER BY d.sort_order, d.id
           )
           FROM planned_meal_dishes d
           LEFT JOIN recipes r ON r.id = d.recipe_id
           WHERE d.planned_meal_id = pm.id
         ),
         '[]'::json
       ) AS dishes
     FROM planned_meals pm
     WHERE pm.household_id = $1 AND pm.id = ANY($2::uuid[])
     ORDER BY
       pm.planned_on NULLS LAST,
       array_position(ARRAY['breakfast', 'lunch', 'dinner', 'snack']::text[], pm.meal_slot::text),
       pm.created_at,
       pm.id`,
    [householdId, ids]
  )
}

export async function writeGroceryChanges(householdId: string, changes: GroceryChanges): Promise<void> {
  await DB.withTransaction(async (tx) => {
    await tx.query(
      `UPDATE grocery_items g
       SET text = x.text, line = x.line, updated_at = NOW()
       FROM jsonb_to_recordset($2::jsonb) AS x(id uuid, text text, line jsonb)
       WHERE g.household_id = $1 AND g.id = x.id`,
      [householdId, JSON.stringify(changes.updates)]
    )
    await tx.query(
      `INSERT INTO grocery_items (household_id, text, line, store_id, section, sort_order)
       SELECT $1, x.text, x.line, x.store_id, x.section, base.top + x.position
       FROM jsonb_to_recordset($2::jsonb) AS x(text text, line jsonb, store_id uuid, section text, position int)
       CROSS JOIN (SELECT COALESCE(MAX(sort_order), 0) AS top FROM grocery_items WHERE household_id = $1) base`,
      [
        householdId,
        JSON.stringify(
          changes.inserts.map((insert, index) => ({
            text: insert.text,
            line: insert.line,
            store_id: insert.storeId,
            section: insert.section,
            position: index + 1
          }))
        )
      ]
    )
    await tx.query(
      `INSERT INTO grocery_list_meals (household_id, planned_meal_id, label, lines)
       SELECT $1, x.planned_meal_id, x.label, x.lines
       FROM jsonb_to_recordset($2::jsonb) AS x(planned_meal_id uuid, label text, lines jsonb)
       ON CONFLICT (household_id, planned_meal_id) DO UPDATE SET
         label = EXCLUDED.label,
         lines = EXCLUDED.lines,
         updated_at = NOW()`,
      [
        householdId,
        JSON.stringify(
          changes.meals.map((meal) => ({ planned_meal_id: meal.plannedMealId, label: meal.label, lines: meal.lines }))
        )
      ]
    )
    await tx.query(`DELETE FROM grocery_list_meals WHERE household_id = $1 AND id = ANY($2::uuid[])`, [
      householdId,
      changes.removeMealIds
    ])
  })
}

export async function listGroceryDefaults(householdId: string, names: string[]): Promise<ItemDefault[]> {
  if (names.length === 0) return []
  return DB.query<ItemDefault>(
    `SELECT name, store_id AS "storeId", section FROM grocery_item_defaults WHERE household_id = $1 AND name = ANY($2::text[])`,
    [householdId, names]
  )
}

export async function listIngredientSections(names: string[]): Promise<IngredientSection[]> {
  if (names.length === 0) return []
  return DB.query<IngredientSection>(`SELECT name, section FROM ingredients WHERE name = ANY($1::text[])`, [names])
}

export async function rememberGroceryDefault(
  householdId: string,
  name: string,
  choice: { storeId?: string | null; section?: GrocerySection | null }
): Promise<void> {
  await DB.query(
    `INSERT INTO grocery_item_defaults (household_id, name, store_id, section)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (household_id, name) DO UPDATE SET
       store_id = CASE WHEN $5::boolean THEN EXCLUDED.store_id ELSE grocery_item_defaults.store_id END,
       section = CASE WHEN $6::boolean THEN EXCLUDED.section ELSE grocery_item_defaults.section END,
       updated_at = NOW()`,
    [
      householdId,
      name,
      choice.storeId ?? null,
      choice.section ?? null,
      choice.storeId !== undefined,
      choice.section !== undefined
    ]
  )
}

export async function listGroceryStores(householdId: string): Promise<GrocerySchemas['GroceryStore'][]> {
  return DB.query<GrocerySchemas['GroceryStore']>(
    `SELECT id, name, sort_order AS "sortOrder" FROM grocery_stores WHERE household_id = $1 ORDER BY sort_order, created_at, id`,
    [householdId]
  )
}

export async function upsertGroceryStore(
  householdId: string,
  input: GrocerySchemas['GroceryStoreInput']
): Promise<GrocerySchemas['GroceryStore'] | null> {
  return DB.queryOne<GrocerySchemas['GroceryStore']>(
    `INSERT INTO grocery_stores (id, household_id, name, sort_order)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order
     WHERE grocery_stores.household_id = EXCLUDED.household_id
     RETURNING id, name, sort_order AS "sortOrder"`,
    [input.id, householdId, input.name, input.sortOrder]
  )
}

export const upsertGroceryStoreStrict = strict(upsertGroceryStore, 'Grocery store')

export async function deleteGroceryStore(householdId: string, id: string): Promise<{ id: string } | null> {
  return DB.queryOne<{ id: string }>(`DELETE FROM grocery_stores WHERE household_id = $1 AND id = $2 RETURNING id`, [
    householdId,
    id
  ])
}

export const deleteGroceryStoreStrict = strict(deleteGroceryStore, 'Grocery store')
