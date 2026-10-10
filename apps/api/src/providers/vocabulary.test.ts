import { beforeEach, describe, expect, it } from 'vitest'
import { DB } from '~/db/connection'
import { createHousehold, defaultMember } from '~/test/accounts'
import { recipeInput } from '~/test/factories'
import { upsertRecipeStrict } from './recipes'
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

let householdId: string

beforeEach(() => {
  householdId = defaultMember().householdId
})

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
    const ids = await DB.withTransaction((tx) => upsertTags(tx, householdId, ['Weeknight', 'weeknight']))

    expect(idFor(ids, 'Weeknight')).toBe(idFor(ids, 'weeknight'))
    expect((await listTags(householdId)).map((tag) => tag.name)).toEqual(['weeknight'])
  })

  it("keeps each household's tags to itself", async () => {
    const otherHouseholdId = await createHousehold()

    const ours = await DB.withTransaction((tx) => upsertTags(tx, householdId, ['weeknight']))
    const theirs = await DB.withTransaction((tx) => upsertTags(tx, otherHouseholdId, ['weeknight', 'date night']))

    expect(idFor(ours, 'weeknight')).not.toBe(idFor(theirs, 'weeknight'))
    expect((await listTags(householdId)).map((tag) => tag.name)).toEqual(['weeknight'])
  })
})

describe('upsertUnits', () => {
  it('folds synonyms onto seeded units', async () => {
    const units = await listUnits(householdId)
    const idOf = (name: string) => units.find((unit) => unit.name === name)?.id

    const ids = await DB.withTransaction((tx) => upsertUnits(tx, ['Tbsp.', 'cups']))

    expect(idFor(ids, 'Tbsp.')).toBe(idOf('tablespoon'))
    expect(idFor(ids, 'cups')).toBe(idOf('cup'))
  })

  it('creates an unknown unit in the "other" category, outside the standard set', async () => {
    const ids = await DB.withTransaction((tx) => upsertUnits(tx, ['Smidgen']))

    const created = await DB.queryOne(`SELECT name, category, is_standard AS "isStandard" FROM units WHERE id = $1`, [
      idFor(ids, 'Smidgen') ?? null
    ])
    expect(created).toEqual({ name: 'smidgen', category: 'other', isStandard: false })
  })
})

describe('listUnits', () => {
  it('lists a custom unit only to households whose recipes use it', async () => {
    const otherHouseholdId = await createHousehold()
    await upsertRecipeStrict(
      householdId,
      recipeInput({ ingredients: [{ name: 'salt', quantity: 1, unit: 'smidgen', notes: null }] })
    )

    expect((await listUnits(householdId)).map((unit) => unit.name)).toContain('smidgen')
    expect((await listUnits(otherHouseholdId)).map((unit) => unit.name)).not.toContain('smidgen')
    expect((await listUnits(otherHouseholdId)).map((unit) => unit.name)).toContain('tablespoon')
  })
})

describe('listIngredients', () => {
  it('ranks prefix matches before other matches', async () => {
    await upsertRecipeStrict(
      householdId,
      recipeInput({ ingredients: [{ name: 'roasted garlic', quantity: null, unit: null, notes: null }] })
    )

    const names = (await listIngredients(householdId, { q: 'Garlic', limit: 10 })).map((ingredient) => ingredient.name)

    expect(names).toEqual(['garlic', 'garlic powder', 'roasted garlic'])
  })

  it("suggests standard ingredients and its own, never another household's", async () => {
    const otherHouseholdId = await createHousehold()
    await upsertRecipeStrict(
      otherHouseholdId,
      recipeInput({ ingredients: [{ name: "grandma's secret sauce", quantity: null, unit: null, notes: null }] })
    )
    await DB.withTransaction((tx) => upsertIngredients(tx, ['orphaned sauce']))

    expect(await listIngredients(householdId, { q: 'sauce', limit: 10 })).not.toContainEqual(
      expect.objectContaining({ name: "grandma's secret sauce" })
    )
    expect(await listIngredients(householdId, { q: 'sauce', limit: 10 })).not.toContainEqual(
      expect.objectContaining({ name: 'orphaned sauce' })
    )
    expect(await listIngredients(otherHouseholdId, { q: 'secret', limit: 10 })).toEqual([
      expect.objectContaining({ name: "grandma's secret sauce" })
    ])
  })

  it('treats LIKE wildcards in the search as literal text', async () => {
    expect(await listIngredients(householdId, { q: '%', limit: 10 })).toEqual([])
  })

  it('honors the limit', async () => {
    expect(await listIngredients(householdId, { limit: 3 })).toHaveLength(3)
  })
})
