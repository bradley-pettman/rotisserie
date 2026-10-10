import { HouseholdSchemas } from '@rotisserie/shared/accounts'
import z from 'zod'
import { listInvites } from '~/providers/households'
import { assertOwner, MemberActor } from '../actors'
import { defineUseCase } from '../define-use-case'

export const ListInvites = defineUseCase({
  actor: MemberActor,
  input: z.object({}),
  output: HouseholdSchemas.HouseholdInvite.array(),
  implementation: async (_input, member) => {
    assertOwner(member)
    return listInvites(member.householdId)
  }
})
