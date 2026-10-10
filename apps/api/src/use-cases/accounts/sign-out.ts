import z from 'zod'
import { deleteSession } from '~/providers/accounts'
import { UserActor } from '../actors'
import { defineUseCase } from '../define-use-case'

export const SignOut = defineUseCase({
  actor: UserActor,
  input: z.object({}),
  output: z.void(),
  implementation: async (_input, { sessionId }) => {
    await deleteSession(sessionId)
  }
})
