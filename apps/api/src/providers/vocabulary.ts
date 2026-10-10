import {
  canonicalizeName,
  canonicalizeUnit,
  type IngredientSchemas,
  type TagSchemas,
  type UnitSchemas
} from '@rotisserie/shared/base'
import { compact, sortBy, uniq } from 'lodash-es'
import { DB, type QueryFns } from '~/db/connection'
import { escapeLike, isoTimestamp } from './sql'

export type VocabularyId = {
  name: string
  id: string
}

function usedByHousehold(column: 'ingredient_id' | 'unit_id', id: string, householdParam: string): string {
  return `EXISTS (
    SELECT 1
    FROM recipe_ingredients ri
    JOIN recipes r ON r.id = ri.recipe_id
    WHERE ri.${column} = ${id} AND r.household_id = ${householdParam}
  )`
}

export async function listIngredients(
  householdId: string,
  options: { q?: string; limit: number }
): Promise<IngredientSchemas['Ingredient'][]> {
  const term = escapeLike(canonicalizeName(options.q ?? ''))
  return DB.query<IngredientSchemas['Ingredient']>(
    `SELECT i.id, i.name
     FROM ingredients i
     WHERE i.name LIKE '%' || $1 || '%'
       AND (i.is_standard OR ${usedByHousehold('ingredient_id', 'i.id', '$3')})
     ORDER BY i.name LIKE $1 || '%' DESC, i.name
     LIMIT $2`,
    [term, options.limit, householdId]
  )
}

export async function listUnits(householdId: string): Promise<UnitSchemas['Unit'][]> {
  return DB.query<UnitSchemas['Unit']>(
    `SELECT u.id, u.name, u.abbreviation, u.category
     FROM units u
     WHERE u.is_standard OR ${usedByHousehold('unit_id', 'u.id', '$1')}
     ORDER BY u.category, u.name`,
    [householdId]
  )
}

export async function listTags(householdId: string): Promise<TagSchemas['Tag'][]> {
  return DB.query<TagSchemas['Tag']>(
    `SELECT id, name, ${isoTimestamp('created_at')} AS "createdAt" FROM tags WHERE household_id = $1 ORDER BY name`,
    [householdId]
  )
}

export async function upsertIngredients(tx: QueryFns, names: string[]): Promise<VocabularyId[]> {
  const canonicalNames = sortBy(compact(uniq(names.map(canonicalizeName))))
  if (canonicalNames.length === 0) return []

  await tx.query(`INSERT INTO ingredients (name) SELECT unnest($1::text[]) ON CONFLICT (name) DO NOTHING`, [canonicalNames])
  const rows = await tx.query<VocabularyId>(`SELECT id, name FROM ingredients WHERE name = ANY($1::text[])`, [
    canonicalNames
  ])

  return names.flatMap((name) => {
    const row = rows.find((candidate) => candidate.name === canonicalizeName(name))
    return row === undefined ? [] : [{ name, id: row.id }]
  })
}

export async function upsertTags(tx: QueryFns, householdId: string, names: string[]): Promise<VocabularyId[]> {
  const canonicalNames = sortBy(compact(uniq(names.map(canonicalizeName))))
  if (canonicalNames.length === 0) return []

  await tx.query(
    `INSERT INTO tags (household_id, name) SELECT $1, unnest($2::text[]) ON CONFLICT (household_id, name) DO NOTHING`,
    [householdId, canonicalNames]
  )
  const rows = await tx.query<VocabularyId>(`SELECT id, name FROM tags WHERE household_id = $1 AND name = ANY($2::text[])`, [
    householdId,
    canonicalNames
  ])

  return names.flatMap((name) => {
    const row = rows.find((candidate) => candidate.name === canonicalizeName(name))
    return row === undefined ? [] : [{ name, id: row.id }]
  })
}

export async function upsertUnits(tx: QueryFns, names: string[]): Promise<VocabularyId[]> {
  const canonicalNames = sortBy(compact(uniq(names.map(canonicalizeUnit))))
  if (canonicalNames.length === 0) return []

  await tx.query(`INSERT INTO units (name, category) SELECT unnest($1::text[]), 'other' ON CONFLICT (name) DO NOTHING`, [
    canonicalNames
  ])
  const rows = await tx.query<VocabularyId>(`SELECT id, name FROM units WHERE name = ANY($1::text[])`, [canonicalNames])

  return names.flatMap((name) => {
    const row = rows.find((candidate) => candidate.name === canonicalizeUnit(name))
    return row === undefined ? [] : [{ name, id: row.id }]
  })
}
