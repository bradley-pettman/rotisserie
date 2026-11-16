import { describe, expect, it } from 'vitest'
import { diffLines, hasChanges, lineText, mealLines, mergeLines, planImport, type ShoppableMeal } from './lines'

const pound = { id: 'u-lb', name: 'pound', abbreviation: 'lb', category: 'weight' as const }
const cup = { id: 'u-cup', name: 'cup', abbreviation: 'cup', category: 'volume' as const }
const tablespoon = { id: 'u-tbsp', name: 'tablespoon', abbreviation: 'tbsp', category: 'volume' as const }
const beef = { id: 'i-beef', name: 'ground beef' }
const onion = { id: 'i-onion', name: 'onion' }
const milk = { id: 'i-milk', name: 'milk' }
const salt = { id: 'i-salt', name: 'salt' }

function chili(overrides: Partial<NonNullable<ShoppableMeal['dishes'][number]['recipe']>> = {}) {
  return {
    name: 'Chili',
    servings: 4,
    ingredients: [
      { ingredient: beef, quantity: 1, unit: pound },
      { ingredient: onion, quantity: 1, unit: null },
      { ingredient: salt, quantity: null, unit: null }
    ],
    ...overrides
  }
}

function meal(dishes: ShoppableMeal['dishes'], headcount: number | null = 4): ShoppableMeal {
  return { id: 'm1', headcount, dishes }
}

describe('mealLines', () => {
  it('turns each recipe ingredient into a line named after its dish', () => {
    expect(mealLines(meal([{ recipe: chili(), customText: null }]))).toEqual([
      {
        key: 'ingredient:i-beef',
        ingredientId: 'i-beef',
        name: 'ground beef',
        amounts: [{ quantity: 1, unit: pound }],
        dishes: ['Chili'],
        meals: ['m1']
      },
      {
        key: 'ingredient:i-onion',
        ingredientId: 'i-onion',
        name: 'onion',
        amounts: [{ quantity: 1, unit: null }],
        dishes: ['Chili'],
        meals: ['m1']
      },
      { key: 'ingredient:i-salt', ingredientId: 'i-salt', name: 'salt', amounts: [], dishes: ['Chili'], meals: ['m1'] }
    ])
  })

  it('scales to the headcount, and leaves a meal without one as the recipe makes it', () => {
    expect(mealLines(meal([{ recipe: chili(), customText: null }], 6))[0]?.amounts).toEqual([{ quantity: 1.5, unit: pound }])
    expect(mealLines(meal([{ recipe: chili(), customText: null }], null))[0]?.amounts).toEqual([
      { quantity: 1, unit: pound }
    ])
  })

  it('adds up an ingredient two dishes share, unit by unit', () => {
    const tacos = {
      name: 'Tacos',
      servings: 4,
      ingredients: [
        { ingredient: beef, quantity: 2, unit: pound },
        { ingredient: onion, quantity: 0.5, unit: cup }
      ]
    }

    const lines = mealLines(
      meal([
        { recipe: chili(), customText: null },
        { recipe: tacos, customText: null }
      ])
    )

    expect(lines.find((line) => line.ingredientId === 'i-beef')).toMatchObject({
      amounts: [{ quantity: 3, unit: pound }],
      dishes: ['Chili', 'Tacos'],
      meals: ['m1']
    })
    expect(lines.find((line) => line.ingredientId === 'i-onion')?.amounts).toEqual([
      { quantity: 1, unit: null },
      { quantity: 0.5, unit: cup }
    ])
  })

  it('keeps a free-text dish as a line of its own', () => {
    expect(mealLines(meal([{ recipe: null, customText: ' Bag salad mix ' }]))).toEqual([
      {
        key: 'text:bag salad mix',
        ingredientId: null,
        name: 'Bag salad mix',
        amounts: [],
        dishes: ['Bag salad mix'],
        meals: ['m1']
      }
    ])
  })
})

describe('mergeLines', () => {
  it('drops an unquantified amount once the line has a real one', () => {
    const [line] = mergeLines([
      {
        key: 'k',
        ingredientId: 'i-salt',
        name: 'salt',
        amounts: [{ quantity: null, unit: null }],
        dishes: ['A'],
        meals: []
      },
      {
        key: 'k',
        ingredientId: 'i-salt',
        name: 'salt',
        amounts: [{ quantity: 1, unit: tablespoon }],
        dishes: ['B'],
        meals: []
      }
    ])
    expect(line?.amounts).toEqual([{ quantity: 1, unit: tablespoon }])
  })
})

describe('converting units', () => {
  const ounce = { id: 'u-oz', name: 'ounce', abbreviation: 'oz', category: 'weight' as const }
  const gram = { id: 'u-g', name: 'gram', abbreviation: 'g', category: 'weight' as const }
  const can = { id: 'u-can', name: 'can', abbreviation: null, category: 'other' as const }

  function merged(...amounts: { quantity: number | null; unit: typeof cup | typeof ounce | typeof can | null }[]) {
    const [line] = mergeLines(
      amounts.map((amount) => ({ key: 'k', ingredientId: 'i', name: 'thing', amounts: [amount], dishes: [], meals: [] }))
    )
    return line ? lineText(line) : ''
  }

  it('adds volumes in the larger unit when it comes out tidy', () => {
    expect(merged({ quantity: 1, unit: cup }, { quantity: 2, unit: tablespoon })).toBe('1⅛ cups thing')
    expect(merged({ quantity: 0.25, unit: cup }, { quantity: 4, unit: tablespoon })).toBe('½ cup thing')
  })

  it('falls back to the smaller unit when the larger one is not tidy', () => {
    expect(merged({ quantity: 3, unit: tablespoon }, { quantity: 0.25, unit: cup })).toBe('7 tbsp thing')
  })

  it('adds weights across systems, rounding grams', () => {
    expect(merged({ quantity: 1, unit: pound }, { quantity: 8, unit: ounce })).toBe('1½ lb thing')
    expect(merged({ quantity: 200, unit: gram }, { quantity: 1, unit: pound })).toBe('654 g thing')
  })

  it('keeps units it cannot convert apart', () => {
    expect(merged({ quantity: 1, unit: can }, { quantity: 1, unit: cup }, { quantity: 2, unit: null })).toBe(
      '1 can + 1 cup + 2 thing'
    )
  })

  it('sees the same amount in another unit as no change', () => {
    const line = (amount: { quantity: number; unit: typeof cup }) => ({
      key: 'k',
      ingredientId: 'i',
      name: 'milk',
      amounts: [amount],
      dishes: [],
      meals: []
    })
    const diff = diffLines([line({ quantity: 1, unit: cup })], [line({ quantity: 16, unit: tablespoon })])
    expect(hasChanges(diff)).toBe(false)
    const more = diffLines([line({ quantity: 1, unit: cup })], [line({ quantity: 20, unit: tablespoon })])
    expect(more.increase.map(lineText)).toEqual(['4 tbsp milk'])
  })
})

describe('lineText', () => {
  it.each([
    [[{ quantity: 1.5, unit: pound }], 'ground beef', '1½ lb ground beef'],
    [[{ quantity: 2, unit: null }], 'bell pepper', '2 bell peppers'],
    [[{ quantity: 1, unit: null }], 'onion', '1 onion'],
    [
      [
        { quantity: 1, unit: cup },
        { quantity: 2, unit: tablespoon }
      ],
      'milk',
      '1 cup + 2 tbsp milk'
    ],
    [[], 'salt', 'salt']
  ])('writes %j %s as %s', (amounts, name, expected) => {
    expect(lineText({ name, amounts })).toBe(expected)
  })
})

describe('diffLines', () => {
  const before = mealLines(meal([{ recipe: chili(), customText: null }]))

  it('finds nothing when the lines are the same', () => {
    expect(hasChanges(diffLines(before, mealLines(meal([{ recipe: chili(), customText: null }]))))).toBe(false)
  })

  it('reports added, removed and changed lines, and what more to buy', () => {
    const after = mealLines(
      meal(
        [
          {
            recipe: chili({
              ingredients: [
                { ingredient: beef, quantity: 1, unit: pound },
                { ingredient: onion, quantity: 1, unit: null },
                { ingredient: milk, quantity: 1, unit: cup }
              ]
            }),
            customText: null
          }
        ],
        8
      )
    )

    const diff = diffLines(before, after)

    expect(diff.added.map((line) => line.name)).toEqual(['milk'])
    expect(diff.removed.map((line) => line.name)).toEqual(['salt'])
    expect(diff.changed.map(({ before, after }) => [lineText(before), lineText(after)])).toEqual([
      ['1 lb ground beef', '2 lb ground beef'],
      ['1 onion', '2 onions']
    ])
    expect(diff.increase.map(lineText)).toEqual(['1 lb ground beef', '1 onion', '2 cups milk'])
  })

  it('needs nothing more when a quantity goes down', () => {
    const after = mealLines(meal([{ recipe: chili(), customText: null }], 2))

    const diff = diffLines(before, after)

    expect(diff.changed).toHaveLength(2)
    expect(diff.increase).toEqual([])
  })
})

describe('planImport', () => {
  const beefLine = mealLines(meal([{ recipe: chili(), customText: null }]))[0]!

  it('adds a line that is not on the list', () => {
    expect(planImport([], [beefLine])).toEqual({ updates: [], inserts: [{ text: '1 lb ground beef', line: beefLine }] })
  })

  it('adds to an unchecked item from an earlier import', () => {
    const listed = {
      id: 'a',
      text: '1 lb ground beef',
      checked: false,
      line: { ...beefLine, dishes: ['Tacos'], meals: ['m1'] }
    }

    expect(planImport([listed], [beefLine]).updates).toEqual([
      {
        id: 'a',
        text: '2 lb ground beef',
        line: { ...beefLine, amounts: [{ quantity: 2, unit: pound }], dishes: ['Tacos', 'Chili'], meals: ['m1'] }
      }
    ])
  })

  it('gives an amount to an item typed by hand with the same name', () => {
    const typed = { id: 'b', text: 'Ground Beef', checked: false, line: null }

    expect(planImport([typed], [beefLine]).updates).toEqual([{ id: 'b', text: '1 lb ground beef', line: beefLine }])
  })

  it('leaves checked items alone, and skips a free-text dish already on the list', () => {
    const bought = { id: 'c', text: '1 lb ground beef', checked: true, line: beefLine }
    const salad = mealLines(meal([{ recipe: null, customText: 'Bag salad mix' }]))[0]!
    const typed = { id: 'd', text: 'bag salad mix', checked: false, line: null }

    expect(planImport([bought, typed], [beefLine, salad])).toEqual({
      updates: [],
      inserts: [{ text: '1 lb ground beef', line: beefLine }]
    })
  })
})
