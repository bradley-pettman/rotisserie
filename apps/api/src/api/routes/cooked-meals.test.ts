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
