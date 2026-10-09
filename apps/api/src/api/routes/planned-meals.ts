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
import { rejectInvalid } from '../errors'

export const plannedMeals = new Hono()
  .get('/unscheduled', async (c) => {
    return c.json(await ListUnscheduledPlannedMeals({}))
  })
  .get('/:id', zValidator('param', GetPlannedMealById.input, rejectInvalid), async (c) => {
    return c.json(await GetPlannedMealById(c.req.valid('param')))
  })
  .put(
    '/:id',
    zValidator('param', UpsertPlannedMeal.input.pick({ id: true }), rejectInvalid),
    zValidator('json', UpsertPlannedMeal.input.omit({ id: true }), rejectInvalid),
    async (c) => {
      return c.json(await UpsertPlannedMeal({ ...c.req.valid('json'), ...c.req.valid('param') }))
    }
  )
  .delete('/:id', zValidator('param', DeletePlannedMeal.input, rejectInvalid), async (c) => {
    await DeletePlannedMeal(c.req.valid('param'))
    return c.body(null, 204)
  })
  .post(
    '/:id/dishes',
    zValidator('param', z.object({ id: AddPlannedDish.input.shape.plannedMealId }), rejectInvalid),
    zValidator('json', AddPlannedDish.input.shape.dish, rejectInvalid),
    async (c) => {
      return c.json(await AddPlannedDish({ plannedMealId: c.req.valid('param').id, dish: c.req.valid('json') }), 201)
    }
  )
  .delete(
    '/:id/dishes/:dishId',
    zValidator(
      'param',
      z.object({ id: RemovePlannedDish.input.shape.plannedMealId, dishId: RemovePlannedDish.input.shape.dishId }),
      rejectInvalid
    ),
    async (c) => {
      const { id, dishId } = c.req.valid('param')
      return c.json(await RemovePlannedDish({ plannedMealId: id, dishId }))
    }
  )
