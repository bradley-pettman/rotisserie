import { UnitSchemas } from '@rotisserie/shared/base'
import z from 'zod'
import { listUnits } from '~/providers/vocabulary'
import { defineUseCase } from '../define-use-case'

export const ListUnits = defineUseCase({
  input: z.object({}),
  output: UnitSchemas.Unit.array(),
  implementation: async () => listUnits()
})
