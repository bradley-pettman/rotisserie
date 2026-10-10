import { HouseholdSchemas } from '@rotisserie/shared/accounts'
import { omit } from 'lodash-es'
import z from 'zod'
import { hashToken } from '~/auth/tokens'
import { extendSession, findSession } from '~/providers/accounts'
import { defineUseCase } from '../define-use-case'
import { SESSION_DAYS, SESSION_REFRESH_AFTER_MS } from './policy'

export const AuthenticateSession = defineUseCase({
  input: z.object({ token: z.string().min(1).max(512) }),
  output: z
    .object({
      sessionId: z.uuid(),
      userId: z.uuid(),
      householdId: z.uuid().nullable(),
      role: HouseholdSchemas.HouseholdRole.nullable()
    })
    .nullable(),
  implementation: async ({ token }) => {
    const session = await findSession(hashToken(token))
    if (session === null) return null

    if (Date.now() - Date.parse(session.lastUsedAt) > SESSION_REFRESH_AFTER_MS) {
      await extendSession(session.sessionId, SESSION_DAYS)
    }
    return omit(session, 'lastUsedAt')
  }
})
