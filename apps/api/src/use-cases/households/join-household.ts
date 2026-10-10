import { HouseholdSchemas } from '@rotisserie/shared/accounts'
import { NotFoundError } from '~/providers/errors'
import { findMembership, redeemInvite } from '~/providers/households'
import { UserActor } from '../actors'
import { defineUseCase } from '../define-use-case'
import { ConflictError } from '../errors'

export const JoinHousehold = defineUseCase({
  actor: UserActor,
  input: HouseholdSchemas.JoinHouseholdInput,
  output: HouseholdSchemas.Household,
  implementation: async ({ code }, { userId }) => {
    if ((await findMembership(userId)) !== null)
      throw new ConflictError('Leave your current household before joining another')

    const household = await redeemInvite(userId, code)
    if (household === null) throw new NotFoundError('That invite code is wrong or has expired')
    return household
  }
})
