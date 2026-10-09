import { randomUUID } from 'node:crypto'
import { RecipeSchemas } from '@rotisserie/shared/recipes'
import { describe, expect, it } from 'vitest'
import { send } from '~/test/api'
import { cookedMealInput, recipeInput } from '~/test/factories'

async function putRecipe(overrides: Parameters<typeof recipeInput>[0] = {}) {
  const { id, ...body } = recipeInput(overrides)
  return send('PUT', `/recipes/${id}`, body)
}

async function putCookedMeal(recipeId: string, cookedOn: string, starRating: number) {
  const { id, ...body } = cookedMealInput({ cookedOn, starRating, dishes: [{ recipeId, isLeftovers: false, notes: null }] })
  return send('PUT', `/cooked-meals/${id}`, body)
}

describe('GET /recipes', () => {
  it('pages recipes with a cursor', async () => {
    await putRecipe({ name: 'First' })
    await putRecipe({ name: 'Second' })
    await putRecipe({ name: 'Third' })

    const first = await send('GET', '/recipes?limit=2')
    const second = await send('GET', `/recipes?limit=2&cursor=${first.body.nextCursor}`)

    expect(first.body.recipes).toHaveLength(2)
    expect(second.body).toMatchObject({ recipes: [{}], nextCursor: null })
  })

  it('includes stats on each recipe', async () => {
    const made = await putRecipe({ name: 'Turkey Meatloaf' })
    await putRecipe({ name: 'Lasagne' })
    await putCookedMeal(made.body.id, '2026-10-05', 5)

    const response = await send('GET', '/recipes')
    const page = RecipeSchemas.RecipeWithStatsPage.parse(response.body)

    expect(page.recipes.map(({ name, stats }) => ({ name, stats }))).toEqual([
      { name: 'Lasagne', stats: { averageRating: null, ratingCount: 0, timesMade: 0, lastMadeOn: null } },
      { name: 'Turkey Meatloaf', stats: { averageRating: 5, ratingCount: 1, timesMade: 1, lastMadeOn: '2026-10-05' } }
    ])
  })

  it('filters by q', async () => {
    await putRecipe({ name: 'Turkey Meatloaf' })
    await putRecipe({ name: 'Lasagne' })

    const response = await send('GET', '/recipes?q=meat')

    expect(response.body.recipes.map((recipe: { name: string }) => recipe.name)).toEqual(['Turkey Meatloaf'])
  })

  it('returns 400 for a malformed cursor or limit', async () => {
    expect((await send('GET', '/recipes?cursor=nope')).status).toBe(400)
    expect(await send('GET', '/recipes?limit=0')).toMatchObject({
      status: 400,
      body: { error: { code: 'validation', fields: { limit: [expect.any(String)] } } }
    })
  })
})

describe('GET /recipes/:id', () => {
  it('returns the recipe with ingredients, tags and stats', async () => {
    const created = await putRecipe()
    await putCookedMeal(created.body.id, '2026-10-05', 4)

    const response = await send('GET', `/recipes/${created.body.id}`)

    expect(response.status).toBe(200)
    expect(RecipeSchemas.RecipeWithStats.parse(response.body)).toEqual({
      ...created.body,
      stats: { averageRating: 4, ratingCount: 1, timesMade: 1, lastMadeOn: '2026-10-05' }
    })
  })

  it('returns 404 for an unknown id and 400 for a malformed one', async () => {
    expect((await send('GET', `/recipes/${randomUUID()}`)).status).toBe(404)
    expect((await send('GET', '/recipes/not-a-uuid')).status).toBe(400)
  })
})

describe('PUT /recipes/:id', () => {
  it('creates a recipe on first upsert and updates it on the second', async () => {
    const id = randomUUID()

    const created = await putRecipe({ id })
    const updated = await putRecipe({ id, name: 'Sloppy Joes', tags: [] })

    expect(created).toMatchObject({ status: 200, body: { id, name: 'Turkey Sloppy Joes', tags: [{ name: 'weeknight' }] } })
    expect(updated).toMatchObject({ status: 200, body: { id, name: 'Sloppy Joes', tags: [] } })
  })

  it('returns 400 with field errors for an invalid body', async () => {
    const response = await putRecipe({ name: '  ', servings: 0 })

    expect(response.status).toBe(400)
    expect(Object.keys(response.body.error.fields).sort()).toEqual(['name', 'servings'])
  })

  it('returns 400 for a body that is not JSON', async () => {
    const response = await send('PUT', `/recipes/${randomUUID()}`, undefined)

    expect(response).toMatchObject({ status: 400, body: { error: { code: 'validation' } } })
  })
})

describe('DELETE /recipes/:id', () => {
  it('returns 204, then 404 on a repeat', async () => {
    const created = await putRecipe()

    expect((await send('DELETE', `/recipes/${created.body.id}`)).status).toBe(204)
    expect((await send('DELETE', `/recipes/${created.body.id}`)).status).toBe(404)
  })
})
