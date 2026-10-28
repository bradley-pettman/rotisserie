import { HouseholdSchemas } from '@rotisserie/shared/accounts'
import z from 'zod'
import { generateInviteCode } from '~/auth/tokens'
import { createInvite } from '~/providers/households'
import { assertOwner, MemberActor } from '../actors'
import { defineUseCase } from '../define-use-case'

const INVITE_DAYS = 7

export const CreateInvite = defineUseCase({
  actor: MemberActor,
  input: z.object({}),
  output: HouseholdSchemas.HouseholdInvite,
  implementation: async (_input, member) => {
    assertOwner(member)
    return createInvite({
      householdId: member.householdId,
      createdBy: member.userId,
      code: generateInviteCode(),
      inviteDays: INVITE_DAYS
    })
  }
})
