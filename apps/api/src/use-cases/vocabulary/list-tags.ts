import { TagSchemas } from '@rotisserie/shared/base'
import z from 'zod'
import { listTags } from '~/providers/vocabulary'
import { MemberActor } from '../actors'
import { defineUseCase } from '../define-use-case'

export const ListTags = defineUseCase({
  actor: MemberActor,
  input: z.object({}),
  output: TagSchemas.Tag.array(),
  implementation: async (_input, { householdId }) => listTags(householdId)
})
