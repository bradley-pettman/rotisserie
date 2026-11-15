import { describe, expect, it } from 'vitest'
import type { ImportedRecipe } from './import'
import { importedOutcome, missingImportFields } from './import-attempts'

const complete: ImportedRecipe = {
  name: 'Chili',
  ingredients: ['1 lb beef'],
  steps: ['Cook it.'],
  prepTimeMinutes: null,
  cookTimeMinutes: null,
  totalTimeMinutes: 45,
  servings: 4
}

describe('missingImportFields', () => {
  it('finds nothing missing in a complete draft', () => {
    expect(missingImportFields(complete)).toEqual([])
  })

  it('counts times as missing only when all three are', () => {
    expect(missingImportFields({ ...complete, totalTimeMinutes: null })).toEqual(['times'])
    expect(missingImportFields({ ...complete, totalTimeMinutes: null, cookTimeMinutes: 20 })).toEqual([])
  })

  it('lists every empty field', () => {
    expect(
      missingImportFields({ ...complete, name: null, ingredients: [], steps: [], totalTimeMinutes: null, servings: null })
    ).toEqual(['name', 'ingredients', 'steps', 'times', 'servings'])
  })
})

describe('importedOutcome', () => {
  it('is imported when only times or servings are missing', () => {
    expect(importedOutcome(['times', 'servings'])).toBe('imported')
  })

  it.each([['name'], ['ingredients'], ['steps']] as const)('is partial without %s', (field) => {
    expect(importedOutcome([field])).toBe('partial')
  })
})
