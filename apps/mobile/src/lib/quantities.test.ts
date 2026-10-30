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

  it('moves parentheses into the notes and drops footnote marks', () => {
    expect(parseIngredientLine('1 (14.5 ounce) can diced tomatoes, drained', UNITS)).toEqual({
      quantity: 1,
      unit: 'can',
      name: 'diced tomatoes',
      notes: '14.5 ounce, drained'
    })
    expect(parseIngredientLine('3 medium zucchini (about 20 oz.)', UNITS)).toEqual({
      quantity: 3,
      unit: null,
      name: 'medium zucchini',
      notes: 'about 20 oz.'
    })
    expect(parseIngredientLine('• 1 lb. ground beef*', UNITS)).toEqual({
      quantity: 1,
      unit: 'pound',
      name: 'ground beef',
      notes: null
    })
  })

  it('lifts nested and oddly placed parentheses the way recipe sites write them', () => {
    expect(parseIngredientLine('600 g scotch fillet steak ((Note 1))', [...UNITS, 'gram'])).toEqual({
      quantity: 600,
      unit: 'gram',
      name: 'scotch fillet steak',
      notes: 'Note 1'
    })
    expect(parseIngredientLine('2 tbsp vegetable oil (, divided)', UNITS).notes).toBe('divided')
    expect(parseIngredientLine('1 large onion ((or 2 small onions), sliced)', UNITS)).toMatchObject({
      name: 'large onion',
      notes: 'or 2 small onions, sliced'
    })
    expect(parseIngredientLine('16 ounces mozzarella, grated (about 4 cups), see Tip', UNITS)).toEqual({
      quantity: 16,
      unit: 'ounce',
      name: 'mozzarella',
      notes: 'grated, about 4 cups, see Tip'
    })
  })

  it('reads a size written before the container', () => {
    expect(parseIngredientLine('1 14.5-oz. can tomato sauce', UNITS)).toEqual({
      quantity: 1,
      unit: 'can',
      name: 'tomato sauce',
      notes: '14.5-oz.'
    })
    expect(parseIngredientLine('2 15oz cans black beans, drained', UNITS)).toEqual({
      quantity: 2,
      unit: 'can',
      name: 'black beans',
      notes: '15oz, drained'
    })
  })

  it('moves a trailing preparation into the notes', () => {
    expect(parseIngredientLine('1 onion finely chopped', UNITS)).toEqual({
      quantity: 1,
      unit: null,
      name: 'onion',
      notes: 'finely chopped'
    })
    expect(parseIngredientLine('1 onion cut into wedges', UNITS).notes).toBe('cut into wedges')
    expect(parseIngredientLine('salt to taste', UNITS)).toMatchObject({ name: 'salt', notes: 'to taste' })
    expect(parseIngredientLine('sliced almonds', UNITS)).toMatchObject({ name: 'sliced almonds', notes: null })
    expect(parseIngredientLine('ground beef', UNITS)).toMatchObject({ name: 'ground beef', notes: null })
  })

  it('drops a price in parentheses', () => {
    expect(parseIngredientLine('1 yellow onion ($0.32)', UNITS)).toEqual({
      quantity: 1,
      unit: null,
      name: 'yellow onion',
      notes: null
    })
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
