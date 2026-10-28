import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { ListIngredients, ListTags, ListUnits } from '~/use-cases/vocabulary'
import { requireMember } from '../auth'
import { rejectInvalid } from '../errors'

export const vocabulary = new Hono()
  .get('/ingredients', requireMember, zValidator('query', ListIngredients.input, rejectInvalid), async (c) => {
    return c.json(await ListIngredients(c.req.valid('query'), c.var.member))
  })
  .get('/units', requireMember, async (c) => {
    return c.json(await ListUnits({}, c.var.member))
  })
  .get('/tags', requireMember, async (c) => {
    return c.json(await ListTags({}, c.var.member))
  })
