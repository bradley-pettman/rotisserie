import { AccountSchemas } from '@rotisserie/shared/accounts'
import { hashPassword } from '~/auth/passwords'
import { generateSessionToken, hashToken } from '~/auth/tokens'
import { createUserWithSession, findCredentials } from '~/providers/accounts'
import { defineUseCase } from '../define-use-case'
import { ConflictError } from '../errors'
import { SESSION_DAYS } from './policy'

export const SignUp = defineUseCase({
  input: AccountSchemas.SignUpInput,
  output: AccountSchemas.AuthSession,
  implementation: async ({ email, password, displayName }) => {
    if ((await findCredentials(email)) !== null) throw new ConflictError('An account with that email already exists')

    const token = generateSessionToken()
    const user = await createUserWithSession({
      email,
      displayName,
      passwordHash: await hashPassword(password),
      tokenHash: hashToken(token),
      sessionDays: SESSION_DAYS
    })
    return { token, me: { user, household: null } }
  }
})
