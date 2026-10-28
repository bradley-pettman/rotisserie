import z from 'zod'
import { NotFoundError } from '~/providers/errors'
import { getHouseholdStrict, removeMember } from '~/providers/households'
import { assertOwner, MemberActor } from '../actors'
import { defineUseCase } from '../define-use-case'
import { ConflictError } from '../errors'
import { isLastOwner } from './owners'

export const RemoveMember = defineUseCase({
  actor: MemberActor,
  input: z.object({ userId: z.uuid() }),
  output: z.void(),
  implementation: async ({ userId }, member) => {
    if (userId !== member.userId) assertOwner(member)
    const household = await getHouseholdStrict(member.householdId)
    if (!household.members.some((candidate) => candidate.userId === userId)) throw new NotFoundError('Member not found')
    if (isLastOwner(household, userId)) {
      throw new ConflictError(
        household.members.length === 1
          ? 'You are the only member. Delete the household instead'
          : 'A household needs an owner. Make someone else an owner first'
      )
    }

    await removeMember(member.householdId, userId)
  }
})
