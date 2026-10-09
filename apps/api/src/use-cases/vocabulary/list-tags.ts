import { TagSchemas } from '@rotisserie/shared/base'
import z from 'zod'
import { listTags } from '~/providers/vocabulary'
import { defineUseCase } from '../define-use-case'

export const ListTags = defineUseCase({
  input: z.object({}),
  output: TagSchemas.Tag.array(),
  implementation: async () => listTags()
})
