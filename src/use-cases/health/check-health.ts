import z from 'zod'
import { checkDatabase } from '~/db/connection'
import { defineUseCase } from '../define-use-case'

export const CheckHealth = defineUseCase({
  input: z.object({}),
  output: z.object({ databaseReachable: z.boolean() }),
  implementation: async () => ({ databaseReachable: await checkDatabase() })
})
