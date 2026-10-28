import { UnitSchemas } from '@rotisserie/shared/base'
import z from 'zod'
import { listUnits } from '~/providers/vocabulary'
import { MemberActor } from '../actors'
import { defineUseCase } from '../define-use-case'

export const ListUnits = defineUseCase({
  actor: MemberActor,
  input: z.object({}),
  output: UnitSchemas.Unit.array(),
  implementation: async (_input, { householdId }) => listUnits(householdId)
})
