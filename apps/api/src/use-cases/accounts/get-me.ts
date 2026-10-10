import { AccountSchemas } from '@rotisserie/shared/accounts'
import z from 'zod'
import { getMeStrict } from '~/providers/accounts'
import { UserActor } from '../actors'
import { defineUseCase } from '../define-use-case'

export const GetMe = defineUseCase({
  actor: UserActor,
  input: z.object({}),
  output: AccountSchemas.Me,
  implementation: async (_input, { userId }) => getMeStrict(userId)
})
