import { Hono } from 'hono'
import { GetMe } from '~/use-cases/accounts'
import { requireUser } from '../auth'

export const me = new Hono().get('/', requireUser, async (c) => {
  return c.json(await GetMe({}, c.var.user))
})
