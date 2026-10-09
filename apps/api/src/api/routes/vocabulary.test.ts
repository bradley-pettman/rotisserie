import { describe, expect, it } from 'vitest'
import { send } from '~/test/api'
import { recipeInput } from '~/test/factories'

describe('GET /ingredients', () => {
  it('autocompletes by q with prefix matches first', async () => {
    const { id, ...body } = recipeInput({
      ingredients: [{ name: 'roasted garlic', quantity: null, unit: null, notes: null }]
    })
    await send('PUT', `/recipes/${id}`, body)

    const response = await send('GET', '/ingredients?q=garlic')

    expect(response.body.map((ingredient: { name: string }) => ingredient.name)).toEqual([
      'garlic',
      'garlic powder',
      'roasted garlic'
    ])
  })
})

describe('GET /units', () => {
  it('lists the seeded units', async () => {
    const response = await send('GET', '/units')

    expect(response.status).toBe(200)
    expect(response.body).toContainEqual(expect.objectContaining({ name: 'tablespoon', category: 'volume' }))
  })
})

describe('GET /tags', () => {
  it('lists tags', async () => {
    const { id, ...body } = recipeInput({ tags: ['Weeknight', 'Kid Friendly'] })
    await send('PUT', `/recipes/${id}`, body)

    const response = await send('GET', '/tags')

    expect(response.body.map((tag: { name: string }) => tag.name)).toEqual(['kid friendly', 'weeknight'])
  })
})
