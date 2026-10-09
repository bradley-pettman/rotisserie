import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { DeleteCookedMeal, GetCookedMealById, ListCookedMeals, UpsertCookedMeal } from '~/use-cases/cooked-meals'
import { rejectInvalid } from '../errors'

export const cookedMeals = new Hono()
  .get('/', zValidator('query', ListCookedMeals.input, rejectInvalid), async (c) => {
    return c.json(await ListCookedMeals(c.req.valid('query')))
  })
  .get('/:id', zValidator('param', GetCookedMealById.input, rejectInvalid), async (c) => {
    return c.json(await GetCookedMealById(c.req.valid('param')))
  })
  .put(
    '/:id',
    zValidator('param', UpsertCookedMeal.input.pick({ id: true }), rejectInvalid),
    zValidator('json', UpsertCookedMeal.input.omit({ id: true }), rejectInvalid),
    async (c) => {
      return c.json(await UpsertCookedMeal({ ...c.req.valid('json'), ...c.req.valid('param') }))
    }
  )
  .delete('/:id', zValidator('param', DeleteCookedMeal.input, rejectInvalid), async (c) => {
    await DeleteCookedMeal(c.req.valid('param'))
    return c.body(null, 204)
  })
