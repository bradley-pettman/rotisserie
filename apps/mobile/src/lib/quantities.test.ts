import { describe, expect, it } from 'vitest'
import { amountLabel, formatQuantity, parseIngredientLine, scaleFactor } from './quantities'

const UNITS = ['cup', 'tablespoon', 'teaspoon', 'fluid ounce', 'ounce', 'pound', 'clove', 'can', 'bunch', 'leaf']

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

describe('scaleFactor', () => {
  it('scales by people over servings', () => {
    expect(scaleFactor(4, 6)).toBe(1.5)
  })

  it('leaves a recipe without servings unscaled', () => {
    expect(scaleFactor(null, 6)).toBe(1)
  })
})

describe('parseIngredientLine', () => {
  it('reads quantity, unit, name and notes', () => {
    expect(parseIngredientLine('2 tbsp Chili Powder', UNITS)).toEqual({
      quantity: 2,
      unit: 'tablespoon',
      name: 'chili powder',
      notes: null
    })
    expect(parseIngredientLine('1 can kidney beans, 15 oz, drained', UNITS)).toEqual({
      quantity: 1,
      unit: 'can',
      name: 'kidney beans',
      notes: '15 oz, drained'
    })
  })

  it('reads mixed numbers, fractions and vulgar fractions', () => {
    expect(parseIngredientLine('1 1/2 cups flour', UNITS).quantity).toBe(1.5)
    expect(parseIngredientLine('3/4 cup milk', UNITS).quantity).toBe(0.75)
    expect(parseIngredientLine('1½ lbs ground turkey', UNITS)).toMatchObject({ quantity: 1.5, unit: 'pound' })
    expect(parseIngredientLine('½ tsp salt', UNITS)).toMatchObject({ quantity: 0.5, unit: 'teaspoon', name: 'salt' })
  })

  it('takes the low end of a range', () => {
    expect(parseIngredientLine('2-3 cloves garlic, minced', UNITS)).toMatchObject({
      quantity: 2,
      unit: 'clove',
      name: 'garlic'
    })
  })

  it('reads a two-word unit', () => {
    expect(parseIngredientLine('8 fl oz cream', UNITS)).toMatchObject({ quantity: 8, unit: 'fluid ounce', name: 'cream' })
  })

  it('keeps a count without a unit', () => {
    expect(parseIngredientLine('1 onion, diced', UNITS)).toEqual({
      quantity: 1,
      unit: null,
      name: 'onion',
      notes: 'diced'
    })
  })

  it('does not take the ingredient as a unit when nothing follows it', () => {
    expect(parseIngredientLine('2 cans', UNITS)).toMatchObject({ quantity: 2, unit: null, name: 'cans' })
  })

  it('reads a line with no quantity', () => {
    expect(parseIngredientLine('salt and pepper, to taste', UNITS)).toEqual({
      quantity: null,
      unit: null,
      name: 'salt and pepper',
      notes: 'to taste'
    })
    expect(parseIngredientLine('pinch of salt', [...UNITS, 'pinch'])).toMatchObject({ unit: 'pinch', name: 'salt' })
  })
})
