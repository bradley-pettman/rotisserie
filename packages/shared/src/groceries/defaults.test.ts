import { describe, expect, it } from 'vitest'
import { defaultsFor, groceryNameKeys } from './defaults'

describe('groceryNameKeys', () => {
  it('drops the amount and offers other spellings to look up', () => {
    expect(groceryNameKeys('2 lb Ground Beef')[0]).toBe('ground beef')
    expect(groceryNameKeys('Bananas')).toEqual(['bananas', 'banana'])
    expect(groceryNameKeys('3 tomatoes')).toContain('tomato')
    expect(groceryNameKeys('berries')).toContain('berry')
    expect(groceryNameKeys('8 tortilla')).toEqual(['tortilla', 'tortillas'])
  })

  it('leaves a word ending in ss alone', () => {
    expect(groceryNameKeys('Swiss chard')[0]).toBe('swiss chard')
    expect(groceryNameKeys('hummus')).not.toContain('hummu')
  })
})

describe('defaultsFor', () => {
  it('prefers what the household chose, then the ingredient section', () => {
    expect(
      defaultsFor(
        ['bananas', 'banana'],
        [{ name: 'banana', storeId: 'aldi', section: null }],
        [{ name: 'banana', section: 'produce' }]
      )
    ).toEqual({ storeId: 'aldi', section: 'produce' })
  })

  it('returns nothing for an unknown item', () => {
    expect(defaultsFor(['diapers'], [], [])).toEqual({ storeId: null, section: null })
  })
})
