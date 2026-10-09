import { canonicalizeName } from '@rotisserie/shared/base'
import type { RecipeSchemas } from '@rotisserie/shared/recipes'
import { omit, uniq } from 'lodash-es'
import { DB, type QueryFns } from '~/db/connection'
import { strict } from './errors'
import { decodeCursor, encodeCursor, escapeLike, InvalidCursorError, isoDate, isoTimestamp } from './sql'
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

const RECIPE_SORTS: Record<
  RecipeSchemas['RecipeSort'],
  { key: string; keyText: string; type: string; direction: 'ASC' | 'DESC' }
> = {
  recentlyMade: {
    key: `COALESCE(s.last_made_on, DATE '1970-01-01')`,
    keyText: isoDate(`COALESCE(s.last_made_on, DATE '1970-01-01')`),
    type: 'date',
    direction: 'DESC'
  },
  longestAgo: {
    key: `COALESCE(s.last_made_on, DATE '9999-12-31')`,
    keyText: isoDate(`COALESCE(s.last_made_on, DATE '9999-12-31')`),
    type: 'date',
    direction: 'ASC'
  },
  name: { key: 'lower(r.name)', keyText: 'lower(r.name)', type: 'text', direction: 'ASC' },
  rating: {
    key: 'COALESCE(s.average_rating, 0)',
    keyText: 'COALESCE(s.average_rating, 0)::text',
    type: 'numeric',
    direction: 'DESC'
  }
}

export async function listRecipes(options: {
  q?: string
  tag?: string
  sort: RecipeSchemas['RecipeSort']
  limit: number
  cursor?: string
}): Promise<RecipeSchemas['RecipeWithStatsPage']> {
  const sort = RECIPE_SORTS[options.sort]
  const [cursorSort = null, cursorKey = null, cursorId = null] =
    options.cursor === undefined ? [] : decodeCursor(options.cursor, 3)
  if (cursorSort !== null && cursorSort !== options.sort) throw new InvalidCursorError()
  const tag = canonicalizeName(options.tag ?? '')

  const rows = await DB.query<RecipeSchemas['RecipeWithStatsPage']['recipes'][number] & { sortKey: string }>(
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
       ${isoTimestamp('r.updated_at')} AS "updatedAt",
       json_build_object(
         'averageRating', ROUND(s.average_rating, 1),
         'ratingCount', s.rating_count,
         'timesMade', s.times_made,
         'lastMadeOn', ${isoDate('s.last_made_on')}
       ) AS stats,
       ${sort.keyText} AS "sortKey"
     FROM recipes r
     JOIN recipe_stats s ON s.recipe_id = r.id
     WHERE (
         r.name ILIKE '%' || $1 || '%'
         OR EXISTS (
           SELECT 1
           FROM recipe_ingredients ri
           JOIN ingredients i ON i.id = ri.ingredient_id
           WHERE ri.recipe_id = r.id AND i.name ILIKE '%' || $1 || '%'
         )
       )
       AND (
         $2::text = ''
         OR EXISTS (
           SELECT 1
           FROM recipe_tags rt
           JOIN tags t ON t.id = rt.tag_id
           WHERE rt.recipe_id = r.id AND t.name = $2
         )
       )
       AND (
         $3::text IS NULL
         OR (${sort.key}, r.id) ${sort.direction === 'ASC' ? '>' : '<'} ($3::${sort.type}, $4::uuid)
       )
     ORDER BY ${sort.key} ${sort.direction}, r.id ${sort.direction}
     LIMIT $5`,
    [escapeLike(options.q?.trim() ?? ''), tag, cursorKey, cursorId, options.limit + 1]
  )

  const page = rows.slice(0, options.limit)
  const last = page.at(-1)
  const nextCursor = rows.length > options.limit && last ? encodeCursor([options.sort, last.sortKey, last.id]) : null
  return { recipes: page.map((row) => omit(row, 'sortKey')), nextCursor }
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
