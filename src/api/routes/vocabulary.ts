import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { ListIngredients, ListTags, ListUnits } from '~/use-cases/vocabulary'
import { rejectInvalid } from '../errors'

export const vocabulary = new Hono()
  .get('/ingredients', zValidator('query', ListIngredients.input, rejectInvalid), async (c) => {
    return c.json(await ListIngredients(c.req.valid('query')))
  })
  .get('/units', async (c) => {
    return c.json(await ListUnits({}))
  })
  .get('/tags', async (c) => {
    return c.json(await ListTags({}))
  })
