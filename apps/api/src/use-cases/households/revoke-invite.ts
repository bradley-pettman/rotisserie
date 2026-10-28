import z from 'zod'
import { deleteInviteStrict } from '~/providers/households'
import { assertOwner, MemberActor } from '../actors'
import { defineUseCase } from '../define-use-case'

export const RevokeInvite = defineUseCase({
  actor: MemberActor,
  input: z.object({ id: z.uuid() }),
  output: z.void(),
  implementation: async ({ id }, member) => {
    assertOwner(member)
    await deleteInviteStrict(member.householdId, id)
  }
})
