import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { AuthenticateSession } from '~/use-cases/accounts'
import type { MemberActor, UserActor } from '~/use-cases/actors'
import { NoHouseholdError, UnauthenticatedError } from '~/use-cases/errors'

async function authenticate(c: Context) {
  const token = /^Bearer\s+(\S+)$/i.exec(c.req.header('Authorization') ?? '')?.[1]
  if (token === undefined) throw new UnauthenticatedError()

  const session = await AuthenticateSession({ token })
  if (session === null) throw new UnauthenticatedError('Your session has ended. Sign in again')
  return session
}

export const requireUser = createMiddleware<{ Variables: { user: UserActor } }>(async (c, next) => {
  const { userId, sessionId } = await authenticate(c)
  c.set('user', { userId, sessionId })
  await next()
})

export const requireMember = createMiddleware<{ Variables: { member: MemberActor } }>(async (c, next) => {
  const { userId, sessionId, householdId, role } = await authenticate(c)
  if (householdId === null || role === null) throw new NoHouseholdError()
  c.set('member', { userId, sessionId, householdId, role })
  await next()
})
