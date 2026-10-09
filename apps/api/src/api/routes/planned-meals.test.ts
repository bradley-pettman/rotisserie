import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { send } from '~/test/api'
import { plannedMealInput } from '~/test/factories'

async function putPlannedMeal(overrides: Parameters<typeof plannedMealInput>[0] = {}) {
  const { id, ...body } = plannedMealInput(overrides)
  return send('PUT', `/planned-meals/${id}`, body)
}

describe('PUT /planned-meals/:id', () => {
  it('creates and then replaces a planned meal', async () => {
    const id = randomUUID()

    await putPlannedMeal({ id, headcount: 4 })
    const replaced = await putPlannedMeal({ id, headcount: 6, notes: 'grandparents' })

    expect(replaced).toMatchObject({ status: 200, body: { id, headcount: 6, notes: 'grandparents' } })
  })

  it('plans a meal with no date, as dinner unless a slot is given', async () => {
    const { id, mealSlot, ...body } = plannedMealInput({ plannedOn: null })

    const response = await send('PUT', `/planned-meals/${id}`, body)

    expect(response).toMatchObject({ status: 200, body: { id, plannedOn: null, mealSlot: 'dinner' } })
  })

  it('returns 409 when the slot is already planned', async () => {
    await putPlannedMeal()

    expect(await putPlannedMeal()).toMatchObject({ status: 409, body: { error: { code: 'conflict' } } })
  })

  it('returns 409 for a dish whose recipe does not exist', async () => {
    const response = await putPlannedMeal({
      dishes: [{ id: randomUUID(), recipeId: randomUUID(), customText: null, notes: null }]
    })

    expect(response.status).toBe(409)
  })

  it('returns 400 for a dish with neither a recipe nor custom text', async () => {
    const response = await putPlannedMeal({ dishes: [{ id: randomUUID(), recipeId: null, customText: null, notes: null }] })

    expect(response).toMatchObject({
      status: 400,
      body: { error: { fields: { 'dishes.0.customText': [expect.any(String)] } } }
    })
  })
})

describe('GET /planned-meals/unscheduled', () => {
  it('returns the planned meals that have no date yet', async () => {
    const unscheduled = await putPlannedMeal({ plannedOn: null })
    await putPlannedMeal()

    expect(await send('GET', '/planned-meals/unscheduled')).toMatchObject({
      status: 200,
      body: [{ id: unscheduled.body.id, plannedOn: null }]
    })
  })
})

describe('GET /planned-meals/:id', () => {
  it('returns the meal, or 404 for an unknown id', async () => {
    const created = await putPlannedMeal()

    expect(await send('GET', `/planned-meals/${created.body.id}`)).toEqual(created)
    expect((await send('GET', `/planned-meals/${randomUUID()}`)).status).toBe(404)
  })
})

describe('DELETE /planned-meals/:id', () => {
  it('returns 204, then 404 on a repeat', async () => {
    const created = await putPlannedMeal()

    expect((await send('DELETE', `/planned-meals/${created.body.id}`)).status).toBe(204)
    expect((await send('DELETE', `/planned-meals/${created.body.id}`)).status).toBe(404)
  })
})

describe('POST /planned-meals/:id/dishes', () => {
  it('appends a dish and returns the meal', async () => {
    const created = await putPlannedMeal({
      dishes: [{ id: randomUUID(), recipeId: null, customText: 'sloppy joes', notes: null }]
    })

    const response = await send('POST', `/planned-meals/${created.body.id}/dishes`, {
      id: randomUUID(),
      recipeId: null,
      customText: 'strawberry salad',
      notes: null
    })

    expect(response).toMatchObject({
      status: 201,
      body: {
        dishes: [
          { customText: 'sloppy joes', sortOrder: 0 },
          { customText: 'strawberry salad', sortOrder: 1 }
        ]
      }
    })
  })

  it('returns 404 for an unknown meal', async () => {
    const response = await send('POST', `/planned-meals/${randomUUID()}/dishes`, {
      id: randomUUID(),
      recipeId: null,
      customText: 'salad',
      notes: null
    })

    expect(response.status).toBe(404)
  })
})

describe('DELETE /planned-meals/:id/dishes/:dishId', () => {
  it('removes the dish and returns the meal', async () => {
    const dishId = randomUUID()
    const created = await putPlannedMeal({ dishes: [{ id: dishId, recipeId: null, customText: 'salad', notes: null }] })

    const response = await send('DELETE', `/planned-meals/${created.body.id}/dishes/${dishId}`)

    expect(response).toMatchObject({ status: 200, body: { id: created.body.id, dishes: [] } })
  })

  it('returns 404 and keeps the dish when it belongs to another meal', async () => {
    const dishId = randomUUID()
    const owner = await putPlannedMeal({ dishes: [{ id: dishId, recipeId: null, customText: 'salad', notes: null }] })
    const other = await putPlannedMeal({ mealSlot: 'lunch' })

    expect((await send('DELETE', `/planned-meals/${other.body.id}/dishes/${dishId}`)).status).toBe(404)
    expect((await send('GET', `/planned-meals/${owner.body.id}`)).body.dishes).toHaveLength(1)
  })
})
