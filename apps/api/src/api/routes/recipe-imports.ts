import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { ListImportAttempts, RecordImportAttempt } from '~/use-cases/recipe-imports'
import { requireMember } from '../auth'
import { rejectInvalid } from '../errors'

export const recipeImports = new Hono()
  .post('/', requireMember, zValidator('json', RecordImportAttempt.input, rejectInvalid), async (c) => {
    await RecordImportAttempt(c.req.valid('json'), c.var.member)
    return c.body(null, 204)
  })
  .get('/', requireMember, zValidator('query', ListImportAttempts.input, rejectInvalid), async (c) => {
    return c.json(await ListImportAttempts(c.req.valid('query'), c.var.member))
  })
