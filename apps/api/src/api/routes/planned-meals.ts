import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import z from 'zod'
import {
  AddPlannedDish,
  DeletePlannedMeal,
  GetPlannedMealById,
  ListUnscheduledPlannedMeals,
  RemovePlannedDish,
  UpsertPlannedMeal
} from '~/use-cases/planned-meals'
import { requireMember } from '../auth'
import { rejectInvalid } from '../errors'

export const plannedMeals = new Hono()
  .get('/unscheduled', requireMember, async (c) => {
    return c.json(await ListUnscheduledPlannedMeals({}, c.var.member))
  })
  .get('/:id', requireMember, zValidator('param', GetPlannedMealById.input, rejectInvalid), async (c) => {
    return c.json(await GetPlannedMealById(c.req.valid('param'), c.var.member))
  })
  .put(
    '/:id',
    requireMember,
    zValidator('param', UpsertPlannedMeal.input.pick({ id: true }), rejectInvalid),
    zValidator('json', UpsertPlannedMeal.input.omit({ id: true }), rejectInvalid),
    async (c) => {
      return c.json(await UpsertPlannedMeal({ ...c.req.valid('json'), ...c.req.valid('param') }, c.var.member))
    }
  )
  .delete('/:id', requireMember, zValidator('param', DeletePlannedMeal.input, rejectInvalid), async (c) => {
    await DeletePlannedMeal(c.req.valid('param'), c.var.member)
    return c.body(null, 204)
  })
  .post(
    '/:id/dishes',
    requireMember,
    zValidator('param', z.object({ id: AddPlannedDish.input.shape.plannedMealId }), rejectInvalid),
    zValidator('json', AddPlannedDish.input.shape.dish, rejectInvalid),
    async (c) => {
      return c.json(
        await AddPlannedDish({ plannedMealId: c.req.valid('param').id, dish: c.req.valid('json') }, c.var.member),
        201
      )
    }
  )
  .delete(
    '/:id/dishes/:dishId',
    requireMember,
    zValidator(
      'param',
      z.object({ id: RemovePlannedDish.input.shape.plannedMealId, dishId: RemovePlannedDish.input.shape.dishId }),
      rejectInvalid
    ),
    async (c) => {
      const { id, dishId } = c.req.valid('param')
      return c.json(await RemovePlannedDish({ plannedMealId: id, dishId }, c.var.member))
    }
  )
