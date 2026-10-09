import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { send } from '~/test/api'
import { cookedMealInput, plannedMealInput, recipeInput } from '~/test/factories'

async function putCookedMeal(overrides: Parameters<typeof cookedMealInput>[0] = {}) {
  const { id, ...body } = cookedMealInput(overrides)
  return send('PUT', `/cooked-meals/${id}`, body)
}

describe('PUT /cooked-meals/:id', () => {
  it('logs a meal that replaces its plan, snapshotting recipe names', async () => {
    const { id: recipeId, ...recipe } = recipeInput({ name: 'Turkey Meatloaf' })
    await send('PUT', `/recipes/${recipeId}`, recipe)
    const { id: plannedMealId, ...plan } = plannedMealInput()
    await send('PUT', `/planned-meals/${plannedMealId}`, plan)

    const response = await putCookedMeal({
      plannedMealId,
      dishes: [{ recipeId, isLeftovers: false, notes: null }]
    })

    expect(response).toMatchObject({
      status: 200,
      body: { plannedMealId, dishes: [{ recipeId, label: 'Turkey Meatloaf' }] }
    })
  })

  it('saves a star rating', async () => {
    expect(await putCookedMeal({ starRating: 4 })).toMatchObject({ status: 200, body: { starRating: 4 } })
  })

  it('returns 400 for a star rating that is not a whole number from 1 to 5', async () => {
    expect((await putCookedMeal({ starRating: 0 })).status).toBe(400)
    expect((await putCookedMeal({ starRating: 6 })).status).toBe(400)
    expect((await putCookedMeal({ starRating: 3.5 })).status).toBe(400)
  })

  it('returns 409 for a second cooked meal on the same plan', async () => {
    const { id: plannedMealId, ...plan } = plannedMealInput()
    await send('PUT', `/planned-meals/${plannedMealId}`, plan)
    await putCookedMeal({ plannedMealId })

    expect((await putCookedMeal({ plannedMealId })).status).toBe(409)
  })

  it('returns 400 for a dish with neither a recipe nor a label', async () => {
    const response = await putCookedMeal({ dishes: [{ recipeId: null, isLeftovers: false, notes: null }] })

    expect(response).toMatchObject({ status: 400, body: { error: { fields: { 'dishes.0.label': [expect.any(String)] } } } })
  })
})

describe('GET /cooked-meals', () => {
  it('pages history newest first', async () => {
    await putCookedMeal({ cookedOn: '2026-10-07' })
    await putCookedMeal({ cookedOn: '2026-10-08' })
    await putCookedMeal({ cookedOn: '2026-10-09' })

    const first = await send('GET', '/cooked-meals?limit=2')
    const second = await send('GET', `/cooked-meals?limit=2&cursor=${first.body.nextCursor}`)

    expect([...first.body.meals, ...second.body.meals].map((meal: { cookedOn: string }) => meal.cookedOn)).toEqual([
      '2026-10-09',
      '2026-10-08',
      '2026-10-07'
    ])
    expect(second.body.nextCursor).toBeNull()
  })
})

describe('GET /cooked-meals/:id', () => {
  it('returns the meal, or 404 for an unknown id', async () => {
    const created = await putCookedMeal()

    expect(await send('GET', `/cooked-meals/${created.body.id}`)).toEqual(created)
    expect((await send('GET', `/cooked-meals/${randomUUID()}`)).status).toBe(404)
  })
})

describe('DELETE /cooked-meals/:id', () => {
  it('returns 204, then 404 on a repeat', async () => {
    const created = await putCookedMeal()

    expect((await send('DELETE', `/cooked-meals/${created.body.id}`)).status).toBe(204)
    expect((await send('DELETE', `/cooked-meals/${created.body.id}`)).status).toBe(404)
  })
})

describe('POST /cooked-meals/settle', () => {
  it('logs past plans as settled cooked meals', async () => {
    const { id, ...plan } = plannedMealInput({
      plannedOn: '2026-10-08',
      dishes: [{ id: randomUUID(), recipeId: null, customText: 'chili', notes: null }]
    })
    await send('PUT', `/planned-meals/${id}`, plan)

    expect(await send('POST', '/cooked-meals/settle', { before: '2026-10-09' })).toMatchObject({
      status: 200,
      body: [{ plannedMealId: id, cookedOn: '2026-10-08', settledOn: '2026-10-09', dishes: [{ label: 'chili' }] }]
    })
  })

  it('returns 400 when before is not a date', async () => {
    expect((await send('POST', '/cooked-meals/settle', { before: 'yesterday' })).status).toBe(400)
  })
})
