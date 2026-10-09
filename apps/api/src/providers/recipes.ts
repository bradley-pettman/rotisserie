import type { RecipeSchemas } from '@rotisserie/shared/recipes'
import { uniq } from 'lodash-es'
import { DB, type QueryFns } from '~/db/connection'
import { strict } from './errors'
import { decodeCursor, encodeCursor, escapeLike, isoTimestamp } from './sql'
import { upsertUnits, upsertIngredients, upsertTags } from './vocabulary'

const RECIPE_SELECT = `
  SELECT
    r.id,
    r.name,
    r.instructions,
    r.prep_time_minutes AS "prepTimeMinutes",
    r.cook_time_minutes AS "cookTimeMinutes",
    r.servings,
    r.source_url AS "sourceUrl",
    r.notes,
    ${isoTimestamp('r.created_at')} AS "createdAt",
    ${isoTimestamp('r.updated_at')} AS "updatedAt",
    COALESCE(
      (
        SELECT json_agg(
          json_build_object(
            'id', ri.id,
            'ingredient', json_build_object('id', i.id, 'name', i.name),
            'quantity', ri.quantity,
            'unit', CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object(
              'id', u.id,
              'name', u.name,
              'abbreviation', u.abbreviation,
              'category', u.category
            ) END,
            'notes', ri.notes,
            'sortOrder', ri.sort_order
          )
          ORDER BY ri.sort_order, ri.id
        )
        FROM recipe_ingredients ri
        JOIN ingredients i ON i.id = ri.ingredient_id
        LEFT JOIN units u ON u.id = ri.unit_id
        WHERE ri.recipe_id = r.id
      ),
      '[]'::json
    ) AS ingredients,
    COALESCE(
      (
        SELECT json_agg(
          json_build_object('id', t.id, 'name', t.name, 'createdAt', ${isoTimestamp('t.created_at')})
          ORDER BY t.name
        )
        FROM recipe_tags rt
        JOIN tags t ON t.id = rt.tag_id
        WHERE rt.recipe_id = r.id
      ),
      '[]'::json
    ) AS tags
  FROM recipes r`

async function fetchRecipe(db: QueryFns, id: string): Promise<RecipeSchemas['Recipe'] | null> {
  return db.queryOne<RecipeSchemas['Recipe']>(`${RECIPE_SELECT} WHERE r.id = $1`, [id])
}

export async function getRecipe(id: string): Promise<RecipeSchemas['Recipe'] | null> {
  return fetchRecipe(DB, id)
}

export const getRecipeStrict = strict(getRecipe, 'Recipe')

export async function listRecipes(options: {
  q?: string
  limit: number
  cursor?: string
}): Promise<RecipeSchemas['RecipePage']> {
  const [cursorCreatedAt = null, cursorId = null] = options.cursor === undefined ? [] : decodeCursor(options.cursor, 2)
  const rows = await DB.query<RecipeSchemas['RecipeRaw']>(
    `SELECT
       r.id,
       r.name,
       r.instructions,
       r.prep_time_minutes AS "prepTimeMinutes",
       r.cook_time_minutes AS "cookTimeMinutes",
       r.servings,
       r.source_url AS "sourceUrl",
       r.notes,
       ${isoTimestamp('r.created_at')} AS "createdAt",
       ${isoTimestamp('r.updated_at')} AS "updatedAt"
     FROM recipes r
     WHERE r.name ILIKE '%' || $1 || '%'
       AND ($2::timestamptz IS NULL OR (r.created_at, r.id) < ($2::timestamptz, $3::uuid))
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT $4`,
    [escapeLike(options.q?.trim() ?? ''), cursorCreatedAt, cursorId, options.limit + 1]
  )

  const recipes = rows.slice(0, options.limit)
  const last = recipes.at(-1)
  const nextCursor = rows.length > options.limit && last ? encodeCursor([last.createdAt, last.id]) : null
  return { recipes, nextCursor }
}

export async function upsertRecipe(input: RecipeSchemas['UpsertRecipeInput']): Promise<RecipeSchemas['Recipe']> {
  return DB.withTransaction(async (tx) => {
    const ingredientIds = await upsertIngredients(
      tx,
      input.ingredients.map((line) => line.name)
    )
    const unitIds = await upsertUnits(
      tx,
      input.ingredients.flatMap((line) => (line.unit === null ? [] : [line.unit]))
    )
    const tagIds = await upsertTags(tx, input.tags)

    await tx.query(
      `INSERT INTO recipes (id, name, instructions, prep_time_minutes, cook_time_minutes, servings, source_url, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         instructions = EXCLUDED.instructions,
         prep_time_minutes = EXCLUDED.prep_time_minutes,
         cook_time_minutes = EXCLUDED.cook_time_minutes,
         servings = EXCLUDED.servings,
         source_url = EXCLUDED.source_url,
         notes = EXCLUDED.notes,
         updated_at = NOW()`,
      [
        input.id,
        input.name,
        input.instructions,
        input.prepTimeMinutes,
        input.cookTimeMinutes,
        input.servings,
        input.sourceUrl,
        input.notes
      ]
    )

    const lines = input.ingredients.map((line, index) => ({
      ingredient_id: ingredientIds.find((ingredient) => ingredient.name === line.name)?.id ?? null,
      unit_id: unitIds.find((unit) => unit.name === line.unit)?.id ?? null,
      quantity: line.quantity,
      notes: line.notes,
      sort_order: index
    }))
    await tx.query(`DELETE FROM recipe_ingredients WHERE recipe_id = $1`, [input.id])
    await tx.query(
      `INSERT INTO recipe_ingredients (recipe_id, ingredient_id, unit_id, quantity, notes, sort_order)
       SELECT $1, x.ingredient_id, x.unit_id, x.quantity, x.notes, x.sort_order
       FROM jsonb_to_recordset($2::jsonb) AS x(ingredient_id uuid, unit_id uuid, quantity numeric, notes text, sort_order int)`,
      [input.id, JSON.stringify(lines)]
    )

    await tx.query(`DELETE FROM recipe_tags WHERE recipe_id = $1`, [input.id])
    await tx.query(`INSERT INTO recipe_tags (recipe_id, tag_id) SELECT $1, unnest($2::uuid[])`, [
      input.id,
      uniq(tagIds.map((tag) => tag.id))
    ])

    const recipe = await fetchRecipe(tx, input.id)
    if (recipe === null) throw new Error(`Recipe ${input.id} missing after upsert`)
    return recipe
  })
}

export async function deleteRecipe(id: string): Promise<{ id: string } | null> {
  return DB.queryOne<{ id: string }>(`DELETE FROM recipes WHERE id = $1 RETURNING id`, [id])
}

export const deleteRecipeStrict = strict(deleteRecipe, 'Recipe')
