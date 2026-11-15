import { ImportAttemptSchemas } from '@rotisserie/shared/recipes'
import z from 'zod'
import { insertImportAttempt } from '~/providers/recipe-imports'
import { MemberActor } from '../actors'
import { defineUseCase } from '../define-use-case'

export const RecordImportAttempt = defineUseCase({
  actor: MemberActor,
  input: ImportAttemptSchemas.RecordImportAttemptInput,
  output: z.void(),
  implementation: async (input, { householdId, userId }) => {
    const host = new URL(input.url).hostname.toLowerCase().replace(/^www\./, '')
    await insertImportAttempt(householdId, { ...input, userId, host })
  }
})
