import { describe, expect, it } from 'vitest'
import type { GroceryItem } from '~/api/groceries'
import { filterItems, groupItems, itemDetail } from './groceries'

function item(overrides: Partial<GroceryItem>): GroceryItem {
  return {
    id: overrides.text ?? 'x',
    text: 'x',
    checked: false,
    sortOrder: 1,
    storeId: null,
    section: null,
    dishes: [],
    mealIds: [],
    createdAt: '2026-11-15T00:00:00.000Z',
    updatedAt: '2026-11-15T00:00:00.000Z',
    ...overrides
  }
}

const stores = [
  { id: 'costco', name: 'Costco', sortOrder: 1 },
  { id: 'aldi', name: 'Aldi', sortOrder: 2 }
]
const beef = item({ text: 'beef', storeId: 'costco', section: 'meat_seafood', mealIds: ['chili'] })
const berries = item({ text: 'berries', storeId: 'aldi', section: 'produce' })
const soap = item({ text: 'soap', section: 'personal_care' })
const thing = item({ text: 'thing' })
const all = [beef, berries, soap, thing]
const none = { storeId: null, mealId: null }

describe('filterItems', () => {
  it('keeps a store’s items and the ones for any store', () => {
    expect(filterItems(all, { storeId: 'aldi', mealId: null })).toEqual([berries, soap, thing])
  })

  it('keeps what one meal needs', () => {
    expect(filterItems(all, { storeId: null, mealId: 'chili' })).toEqual([beef])
  })
})

describe('groupItems', () => {
  it('groups by store in the household’s order, ending with any store', () => {
    expect(groupItems(all, 'store', stores, none).map((group) => [group.title, group.items.map((i) => i.text)])).toEqual([
      ['Costco', ['beef']],
      ['Aldi', ['berries']],
      ['Any store', ['soap', 'thing']]
    ])
  })

  it('shows only the filtered store’s group', () => {
    const groups = groupItems(filterItems(all, { storeId: 'aldi', mealId: null }), 'store', stores, {
      storeId: 'aldi',
      mealId: null
    })
    expect(groups.map((group) => group.title)).toEqual(['Aldi', 'Any store'])
  })

  it('groups by section, skipping empty ones, with unsorted items under Other', () => {
    const groups = groupItems(all, 'section', stores, { storeId: 'aldi', mealId: null })
    expect(groups.map((group) => [group.title, group.items.map((i) => i.text)])).toEqual([
      ['Produce', ['berries']],
      ['Meat & seafood', ['beef']],
      ['Personal care', ['soap']],
      ['Other', ['thing']]
    ])
    expect(groups[0]?.assign).toEqual({ storeId: 'aldi', section: 'produce' })
    expect(groups.at(-1)?.assign).toEqual({ storeId: 'aldi' })
  })
})

describe('itemDetail', () => {
  it('names the store and the dishes', () => {
    expect(itemDetail(item({ storeId: 'aldi', dishes: ['Chili', 'Tacos'] }), stores, true)).toBe('Aldi · for Chili, Tacos')
    expect(itemDetail(item({ storeId: 'aldi' }), stores, false)).toBe('')
  })
})
