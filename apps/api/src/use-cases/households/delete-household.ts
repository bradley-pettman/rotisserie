import z from 'zod'
import { deleteHouseholdStrict } from '~/providers/households'
import { assertOwner, MemberActor } from '../actors'
import { defineUseCase } from '../define-use-case'

export const DeleteHousehold = defineUseCase({
  actor: MemberActor,
  input: z.object({}),
  output: z.void(),
  implementation: async (_input, member) => {
    assertOwner(member)
    await deleteHouseholdStrict(member.householdId)
  }
})
