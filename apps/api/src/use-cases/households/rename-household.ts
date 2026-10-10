import { HouseholdSchemas } from '@rotisserie/shared/accounts'
import { getHouseholdStrict, renameHousehold } from '~/providers/households'
import { assertOwner, MemberActor } from '../actors'
import { defineUseCase } from '../define-use-case'

export const RenameHousehold = defineUseCase({
  actor: MemberActor,
  input: HouseholdSchemas.RenameHouseholdInput,
  output: HouseholdSchemas.Household,
  implementation: async ({ name }, member) => {
    assertOwner(member)
    await renameHousehold(member.householdId, name)
    return getHouseholdStrict(member.householdId)
  }
})
