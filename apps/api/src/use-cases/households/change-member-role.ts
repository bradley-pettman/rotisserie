import { HouseholdSchemas } from '@rotisserie/shared/accounts'
import { NotFoundError } from '~/providers/errors'
import { getHouseholdStrict, setMemberRole } from '~/providers/households'
import { assertOwner, MemberActor } from '../actors'
import { defineUseCase } from '../define-use-case'
import { ConflictError } from '../errors'
import { isLastOwner } from './owners'

export const ChangeMemberRole = defineUseCase({
  actor: MemberActor,
  input: HouseholdSchemas.ChangeMemberRoleInput,
  output: HouseholdSchemas.Household,
  implementation: async ({ userId, role }, member) => {
    assertOwner(member)
    const household = await getHouseholdStrict(member.householdId)
    if (!household.members.some((candidate) => candidate.userId === userId)) throw new NotFoundError('Member not found')
    if (role !== 'owner' && isLastOwner(household, userId)) {
      throw new ConflictError('A household needs an owner. Make someone else an owner first')
    }

    await setMemberRole(member.householdId, userId, role)
    return getHouseholdStrict(member.householdId)
  }
})
