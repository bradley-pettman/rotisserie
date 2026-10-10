import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMember, type TestMember } from '~/test/accounts'
import { send } from '~/test/api'
import { cookedMealInput, plannedMealInput, recipeInput } from '~/test/factories'

let neighbor: TestMember

beforeEach(async () => {
  neighbor = await createMember({ displayName: 'Neighbor' })
})

async function ourRecipe() {
  const { id, ...body } = recipeInput({ name: 'Family Chili', tags: ['secret'] })
  await send('PUT', `/recipes/${id}`, body)
  return id
}

async function ourPlan(overrides: Parameters<typeof plannedMealInput>[0] = {}) {
  const { id, ...body } = plannedMealInput(overrides)
  return (await send('PUT', `/planned-meals/${id}`, body)).body
}

async function ourCookedMeal() {
  const { id, ...body } = cookedMealInput()
  await send('PUT', `/cooked-meals/${id}`, body)
  return id
}

describe('another household', () => {
  it('cannot read, overwrite or delete our recipe', async () => {
    const id = await ourRecipe()
    const { id: _id, ...takeover } = recipeInput({ name: 'Mine now' })

    expect((await send('GET', `/recipes/${id}`, undefined, { as: neighbor })).status).toBe(404)
    expect((await send('PUT', `/recipes/${id}`, takeover, { as: neighbor })).status).toBe(404)
    expect((await send('DELETE', `/recipes/${id}`, undefined, { as: neighbor })).status).toBe(404)

    expect(await send('GET', `/recipes/${id}`)).toMatchObject({ status: 200, body: { name: 'Family Chili' } })
  })

  it('cannot read, overwrite or delete our planned meal', async () => {
    const plan = await ourPlan({ notes: 'ours' })
    const { id: _id, ...takeover } = plannedMealInput({ notes: 'theirs' })

    expect((await send('GET', `/planned-meals/${plan.id}`, undefined, { as: neighbor })).status).toBe(404)
    expect((await send('PUT', `/planned-meals/${plan.id}`, takeover, { as: neighbor })).status).toBe(404)
    expect((await send('DELETE', `/planned-meals/${plan.id}`, undefined, { as: neighbor })).status).toBe(404)

    expect(await send('GET', `/planned-meals/${plan.id}`)).toMatchObject({ status: 200, body: { notes: 'ours' } })
  })

  it('cannot add or remove dishes on our planned meal', async () => {
    const plan = await ourPlan({ dishes: [{ id: randomUUID(), recipeId: null, customText: 'Salad', notes: null }] })
    const dish = { id: randomUUID(), recipeId: null, customText: 'Pizza', notes: null }

    expect((await send('POST', `/planned-meals/${plan.id}/dishes`, dish, { as: neighbor })).status).toBe(404)
    expect(
      (await send('DELETE', `/planned-meals/${plan.id}/dishes/${plan.dishes[0].id}`, undefined, { as: neighbor })).status
    ).toBe(404)

    expect((await send('GET', `/planned-meals/${plan.id}`)).body.dishes).toEqual([
      expect.objectContaining({ customText: 'Salad' })
    ])
  })

  it('cannot read, overwrite or delete our cooked meal', async () => {
    const id = await ourCookedMeal()
    const { id: _id, ...takeover } = cookedMealInput({ notes: 'theirs' })

    expect((await send('GET', `/cooked-meals/${id}`, undefined, { as: neighbor })).status).toBe(404)
    expect((await send('PUT', `/cooked-meals/${id}`, takeover, { as: neighbor })).status).toBe(404)
    expect((await send('DELETE', `/cooked-meals/${id}`, undefined, { as: neighbor })).status).toBe(404)

    expect((await send('GET', `/cooked-meals/${id}`)).status).toBe(200)
  })

  it('cannot put our recipe in its plans or its history', async () => {
    const recipeId = await ourRecipe()
    const { id: planId, ...plan } = plannedMealInput({
      dishes: [{ id: randomUUID(), recipeId, customText: null, notes: null }]
    })
    const { id: cookedId, ...cooked } = cookedMealInput({ dishes: [{ recipeId, isLeftovers: false, notes: null }] })

    expect(await send('PUT', `/planned-meals/${planId}`, plan, { as: neighbor })).toMatchObject({
      status: 409,
      body: { error: { code: 'conflict' } }
    })
    const logged = await send('PUT', `/cooked-meals/${cookedId}`, cooked, { as: neighbor })
    expect(logged.status).toBe(409)
    expect(JSON.stringify(logged.body)).not.toContain('Family Chili')
  })

  it('cannot link its cooked meal to our plan', async () => {
    const plan = await ourPlan()
    const { id, ...cooked } = cookedMealInput({ plannedMealId: plan.id })

    expect((await send('PUT', `/cooked-meals/${id}`, cooked, { as: neighbor })).status).toBe(409)
  })

  it('sees none of our data in its lists', async () => {
    await ourRecipe()
    await ourPlan()
    await ourPlan({ plannedOn: null })
    await ourCookedMeal()

    expect((await send('GET', '/recipes', undefined, { as: neighbor })).body.recipes).toEqual([])
    expect((await send('GET', '/recipes?q=chili', undefined, { as: neighbor })).body.recipes).toEqual([])
    expect((await send('GET', '/tags', undefined, { as: neighbor })).body).toEqual([])
    expect((await send('GET', '/planned-meals/unscheduled', undefined, { as: neighbor })).body).toEqual([])
    expect((await send('GET', '/cooked-meals', undefined, { as: neighbor })).body.meals).toEqual([])
    expect((await send('GET', '/meals?from=2026-10-01&to=2026-10-31', undefined, { as: neighbor })).body).toEqual({
      planned: [],
      cooked: []
    })
  })

  it('can plan the same slot on the same day as us', async () => {
    await ourPlan({ plannedOn: '2026-10-09', mealSlot: 'dinner' })
    const { id, ...theirs } = plannedMealInput({ plannedOn: '2026-10-09', mealSlot: 'dinner' })

    expect((await send('PUT', `/planned-meals/${id}`, theirs, { as: neighbor })).status).toBe(200)
  })

  it('only settles its own past plans', async () => {
    await ourPlan({
      plannedOn: '2026-10-01',
      dishes: [{ id: randomUUID(), recipeId: null, customText: 'Tacos', notes: null }]
    })
    const { id, ...theirs } = plannedMealInput({
      plannedOn: '2026-10-01',
      dishes: [{ id: randomUUID(), recipeId: null, customText: 'Curry', notes: null }]
    })
    await send('PUT', `/planned-meals/${id}`, theirs, { as: neighbor })

    const settled = await send('POST', '/cooked-meals/settle', { before: '2026-10-05' }, { as: neighbor })

    expect(settled.body).toEqual([
      expect.objectContaining({ plannedMealId: id, dishes: [expect.objectContaining({ label: 'Curry' })] })
    ])
    expect((await send('GET', '/cooked-meals')).body.meals).toEqual([])
  })
})
