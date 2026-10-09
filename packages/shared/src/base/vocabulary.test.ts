import { describe, expect, it } from 'vitest'
import { canonicalizeName, canonicalizeUnit } from './vocabulary'

describe('canonicalizeName', () => {
  it('lowercases, trims and collapses inner whitespace', () => {
    expect(canonicalizeName('  Smoked   Paprika ')).toBe('smoked paprika')
  })

  it('returns an empty string for blank input', () => {
    expect(canonicalizeName('   ')).toBe('')
  })
})

describe('canonicalizeUnit', () => {
  it.each([
    ['Tbsp.', 'tablespoon'],
    ['CUPS', 'cup'],
    ['fl. oz.', 'fluid ounce'],
    ['lbs', 'pound'],
    ['tins', 'can'],
    ['leaves', 'leaf']
  ])('folds %s onto %s', (input, expected) => {
    expect(canonicalizeUnit(input)).toBe(expected)
  })

  it('keeps a canonical name as it is', () => {
    expect(canonicalizeUnit('teaspoon')).toBe('teaspoon')
  })

  it('canonicalizes an unknown unit without guessing', () => {
    expect(canonicalizeUnit(' T ')).toBe('t')
    expect(canonicalizeUnit('Smidgen')).toBe('smidgen')
  })

  it('ignores object prototype keys', () => {
    expect(canonicalizeUnit('constructor')).toBe('constructor')
  })
})
