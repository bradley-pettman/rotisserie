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

export async function listIngredients(options: { q?: string; limit: number }): Promise<IngredientSchemas['Ingredient'][]> {
  const term = escapeLike(canonicalizeName(options.q ?? ''))
  return DB.query<IngredientSchemas['Ingredient']>(
    `SELECT id, name
     FROM ingredients
     WHERE name LIKE '%' || $1 || '%'
     ORDER BY name LIKE $1 || '%' DESC, name
     LIMIT $2`,
    [term, options.limit]
  )
}

export async function listUnits(): Promise<UnitSchemas['Unit'][]> {
  return DB.query<UnitSchemas['Unit']>(`SELECT id, name, abbreviation, category FROM units ORDER BY category, name`)
}

export async function listTags(): Promise<TagSchemas['Tag'][]> {
  return DB.query<TagSchemas['Tag']>(`SELECT id, name, ${isoTimestamp('created_at')} AS "createdAt" FROM tags ORDER BY name`)
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

export async function upsertTags(tx: QueryFns, names: string[]): Promise<VocabularyId[]> {
  const canonicalNames = sortBy(compact(uniq(names.map(canonicalizeName))))
  if (canonicalNames.length === 0) return []

  await tx.query(`INSERT INTO tags (name) SELECT unnest($1::text[]) ON CONFLICT (name) DO NOTHING`, [canonicalNames])
  const rows = await tx.query<VocabularyId>(`SELECT id, name FROM tags WHERE name = ANY($1::text[])`, [canonicalNames])

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
