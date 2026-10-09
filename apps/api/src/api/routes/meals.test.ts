import { describe, expect, it } from 'vitest'
import { send } from '~/test/api'
import { cookedMealInput, plannedMealInput } from '~/test/factories'

describe('GET /meals', () => {
  it('returns planned and cooked meals for the range side by side', async () => {
    const { id: plannedId, ...planned } = plannedMealInput({
      dishes: [{ id: crypto.randomUUID(), recipeId: null, customText: 'sloppy joes', notes: null }]
    })
    await send('PUT', `/planned-meals/${plannedId}`, planned)
    const { id: cookedId, ...cooked } = cookedMealInput({
      plannedMealId: plannedId,
      dishes: [{ recipeId: null, label: 'meatloaf', isLeftovers: false, notes: null }]
    })
    await send('PUT', `/cooked-meals/${cookedId}`, cooked)

    const response = await send('GET', '/meals?from=2026-10-05&to=2026-10-11')

    expect(response).toMatchObject({
      status: 200,
      body: {
        planned: [{ id: plannedId, dishes: [{ customText: 'sloppy joes' }] }],
        cooked: [{ id: cookedId, plannedMealId: plannedId, dishes: [{ label: 'meatloaf' }] }]
      }
    })
  })

  it('returns 400 when from or to is missing, not a date, or out of order', async () => {
    expect((await send('GET', '/meals?from=2026-10-05')).status).toBe(400)
    expect((await send('GET', '/meals?from=2026-10-05&to=friday')).status).toBe(400)
    expect((await send('GET', '/meals?from=2026-10-11&to=2026-10-05')).status).toBe(400)
  })
})
