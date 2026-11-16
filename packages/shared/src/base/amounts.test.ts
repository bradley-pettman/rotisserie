import { describe, expect, it } from 'vitest'
import { amountLabel, formatQuantity, pluralize, pluralizeName, scaleFactor } from './amounts'

describe('formatQuantity', () => {
  it.each([
    [1, '1'],
    [1.5, '1½'],
    [0.25, '¼'],
    [2 / 3, '⅔'],
    [0.375, '⅜'],
    [2.999, '3'],
    [1.1, '1.1']
  ])('formats %s as %s', (value, expected) => {
    expect(formatQuantity(value)).toBe(expected)
  })
})

describe('amountLabel', () => {
  it('uses a real abbreviation as it is', () => {
    expect(amountLabel(1.5, { name: 'pound', abbreviation: 'lb' })).toBe('1½ lb')
  })

  it('pluralizes a unit that has no abbreviation', () => {
    expect(amountLabel(3, { name: 'clove', abbreviation: null })).toBe('3 cloves')
    expect(amountLabel(2, { name: 'bunch', abbreviation: null })).toBe('2 bunches')
    expect(amountLabel(1.5, { name: 'cup', abbreviation: 'cup' })).toBe('1½ cups')
  })

  it('handles a bare count and a bare unit', () => {
    expect(amountLabel(2, null)).toBe('2')
    expect(amountLabel(null, { name: 'pinch', abbreviation: null })).toBe('pinch')
  })
})

describe('pluralize', () => {
  it.each([
    ['onion', 'onions'],
    ['radish', 'radishes'],
    ['berry', 'berries'],
    ['tomato', 'tomatoes'],
    ['leaf', 'leaves']
  ])('pluralizes %s as %s', (word, expected) => {
    expect(pluralize(word)).toBe(expected)
  })

  it('pluralizes the last word of a name', () => {
    expect(pluralizeName('bell pepper')).toBe('bell peppers')
  })
})

describe('scaleFactor', () => {
  it('scales by people over servings', () => {
    expect(scaleFactor(4, 6)).toBe(1.5)
  })

  it('leaves a recipe without servings unscaled', () => {
    expect(scaleFactor(null, 6)).toBe(1)
  })
})
