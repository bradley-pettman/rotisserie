import { HouseholdSchemas } from '@rotisserie/shared/accounts'
import { createHousehold, findMembership } from '~/providers/households'
import { UserActor } from '../actors'
import { defineUseCase } from '../define-use-case'
import { ConflictError } from '../errors'

export const CreateHousehold = defineUseCase({
  actor: UserActor,
  input: HouseholdSchemas.CreateHouseholdInput,
  output: HouseholdSchemas.Household,
  implementation: async ({ name }, { userId }) => {
    if ((await findMembership(userId)) !== null) throw new ConflictError('You already belong to a household')
    return createHousehold(userId, name)
  }
})
