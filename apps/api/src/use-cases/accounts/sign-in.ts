import { AccountSchemas } from '@rotisserie/shared/accounts'
import { verifyNoPassword, verifyPassword } from '~/auth/passwords'
import { generateSessionToken, hashToken } from '~/auth/tokens'
import { createSession, findCredentials, getMeStrict } from '~/providers/accounts'
import { defineUseCase } from '../define-use-case'
import { UnauthenticatedError } from '../errors'
import { SESSION_DAYS } from './policy'

export const SignIn = defineUseCase({
  input: AccountSchemas.SignInInput,
  output: AccountSchemas.AuthSession,
  implementation: async ({ email, password }) => {
    const credentials = await findCredentials(email)
    const valid =
      credentials === null ? await verifyNoPassword(password) : await verifyPassword(password, credentials.passwordHash)
    if (credentials === null || !valid) throw new UnauthenticatedError('Wrong email or password')

    const token = generateSessionToken()
    await createSession(credentials.userId, hashToken(token), SESSION_DAYS)
    return { token, me: await getMeStrict(credentials.userId) }
  }
})
