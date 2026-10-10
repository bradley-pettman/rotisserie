import { HouseholdSchemas } from '@rotisserie/shared/accounts'
import z from 'zod'
import { getHouseholdStrict } from '~/providers/households'
import { MemberActor } from '../actors'
import { defineUseCase } from '../define-use-case'

export const GetHousehold = defineUseCase({
  actor: MemberActor,
  input: z.object({}),
  output: HouseholdSchemas.Household,
  implementation: async (_input, { householdId }) => getHouseholdStrict(householdId)
})
