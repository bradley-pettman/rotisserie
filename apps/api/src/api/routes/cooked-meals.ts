import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  DeleteCookedMeal,
  GetCookedMealById,
  ListCookedMeals,
  SettlePlannedMeals,
  UpsertCookedMeal
} from '~/use-cases/cooked-meals'
import { requireMember } from '../auth'
import { rejectInvalid } from '../errors'

export const cookedMeals = new Hono()
  .get('/', requireMember, zValidator('query', ListCookedMeals.input, rejectInvalid), async (c) => {
    return c.json(await ListCookedMeals(c.req.valid('query'), c.var.member))
  })
  .post('/settle', requireMember, zValidator('json', SettlePlannedMeals.input, rejectInvalid), async (c) => {
    return c.json(await SettlePlannedMeals(c.req.valid('json'), c.var.member))
  })
  .get('/:id', requireMember, zValidator('param', GetCookedMealById.input, rejectInvalid), async (c) => {
    return c.json(await GetCookedMealById(c.req.valid('param'), c.var.member))
  })
  .put(
    '/:id',
    requireMember,
    zValidator('param', UpsertCookedMeal.input.pick({ id: true }), rejectInvalid),
    zValidator('json', UpsertCookedMeal.input.omit({ id: true }), rejectInvalid),
    async (c) => {
      return c.json(await UpsertCookedMeal({ ...c.req.valid('json'), ...c.req.valid('param') }, c.var.member))
    }
  )
  .delete('/:id', requireMember, zValidator('param', DeleteCookedMeal.input, rejectInvalid), async (c) => {
    await DeleteCookedMeal(c.req.valid('param'), c.var.member)
    return c.body(null, 204)
  })
