import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { ListMealsWithinDateRange } from '~/use-cases/meals'
import { rejectInvalid } from '../errors'

export const meals = new Hono().get('/', zValidator('query', ListMealsWithinDateRange.input, rejectInvalid), async (c) => {
  return c.json(await ListMealsWithinDateRange(c.req.valid('query')))
})
