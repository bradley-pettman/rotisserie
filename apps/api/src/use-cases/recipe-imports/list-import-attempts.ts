import { ImportAttemptSchemas } from '@rotisserie/shared/recipes'
import { listImportAttempts } from '~/providers/recipe-imports'
import { MemberActor } from '../actors'
import { defineUseCase } from '../define-use-case'

export const ListImportAttempts = defineUseCase({
  actor: MemberActor,
  input: ImportAttemptSchemas.ListImportAttemptsQuery,
  output: ImportAttemptSchemas.ImportAttempt.array(),
  implementation: async (query, { householdId }) => listImportAttempts(householdId, query)
})
