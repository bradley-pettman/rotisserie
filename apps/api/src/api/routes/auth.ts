import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { SignIn, SignOut, SignUp } from '~/use-cases/accounts'
import { requireUser } from '../auth'
import { rejectInvalid } from '../errors'

export const auth = new Hono()
  .post('/sign-up', zValidator('json', SignUp.input, rejectInvalid), async (c) => {
    return c.json(await SignUp(c.req.valid('json')), 201)
  })
  .post('/sign-in', zValidator('json', SignIn.input, rejectInvalid), async (c) => {
    return c.json(await SignIn(c.req.valid('json')))
  })
  .post('/sign-out', requireUser, async (c) => {
    await SignOut({}, c.var.user)
    return c.body(null, 204)
  })
