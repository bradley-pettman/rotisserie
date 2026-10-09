import { describe, expect, it } from 'vitest'
import { DB } from '~/db/connection'
import {
  type VocabularyId,
  listIngredients,
  listTags,
  listUnits,
  upsertUnits,
  upsertIngredients,
  upsertTags
} from './vocabulary'

function idFor(ids: VocabularyId[], name: string): string | undefined {
  return ids.find((entry) => entry.name === name)?.id
}

describe('upsertIngredients', () => {
  it('reuses the seeded row for any capitalization and creates new names lowercase', async () => {
    const seededGarlic = await DB.queryOne<{ id: string }>(`SELECT id FROM ingredients WHERE name = 'garlic'`)

    const ids = await DB.withTransaction((tx) => upsertIngredients(tx, ['  Garlic ', 'garlic', 'Smoked  Paprika']))

    expect(idFor(ids, '  Garlic ')).toBe(seededGarlic?.id)
    expect(idFor(ids, 'garlic')).toBe(seededGarlic?.id)
    const paprika = await DB.queryOne<{ name: string }>(`SELECT name FROM ingredients WHERE id = $1`, [
      idFor(ids, 'Smoked  Paprika') ?? null
    ])
    expect(paprika?.name).toBe('smoked paprika')
  })

  it('skips blank names', async () => {
    const ids = await DB.withTransaction((tx) => upsertIngredients(tx, ['', '   ']))
    expect(ids).toEqual([])
  })
})

describe('upsertTags', () => {
  it('maps differently-cased spellings onto one tag', async () => {
    const ids = await DB.withTransaction((tx) => upsertTags(tx, ['Weeknight', 'weeknight']))

    expect(idFor(ids, 'Weeknight')).toBe(idFor(ids, 'weeknight'))
    expect((await listTags()).map((tag) => tag.name)).toEqual(['weeknight'])
  })
})

describe('upsertUnits', () => {
  it('folds synonyms onto seeded units', async () => {
    const units = await listUnits()
    const idOf = (name: string) => units.find((unit) => unit.name === name)?.id

    const ids = await DB.withTransaction((tx) => upsertUnits(tx, ['Tbsp.', 'cups']))

    expect(idFor(ids, 'Tbsp.')).toBe(idOf('tablespoon'))
    expect(idFor(ids, 'cups')).toBe(idOf('cup'))
  })

  it('creates an unknown unit in the "other" category', async () => {
    const ids = await DB.withTransaction((tx) => upsertUnits(tx, ['Smidgen']))

    const created = (await listUnits()).find((unit) => unit.id === idFor(ids, 'Smidgen'))
    expect(created).toMatchObject({ name: 'smidgen', category: 'other' })
  })
})

describe('listIngredients', () => {
  it('ranks prefix matches before other matches', async () => {
    await DB.withTransaction((tx) => upsertIngredients(tx, ['roasted garlic']))

    const names = (await listIngredients({ q: 'Garlic', limit: 10 })).map((ingredient) => ingredient.name)

    expect(names).toEqual(['garlic', 'garlic powder', 'roasted garlic'])
  })

  it('treats LIKE wildcards in the search as literal text', async () => {
    expect(await listIngredients({ q: '%', limit: 10 })).toEqual([])
  })

  it('honors the limit', async () => {
    expect(await listIngredients({ limit: 3 })).toHaveLength(3)
  })
})
