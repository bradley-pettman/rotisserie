import { HouseholdSchemas } from '@rotisserie/shared/accounts'
import z from 'zod'
import { ForbiddenError } from './errors'

export const UserActor = z.object({
  userId: z.uuid(),
  sessionId: z.uuid()
})

export type UserActor = z.output<typeof UserActor>

export const MemberActor = UserActor.extend({
  householdId: z.uuid(),
  role: HouseholdSchemas.HouseholdRole
})

export type MemberActor = z.output<typeof MemberActor>

export function assertOwner(member: MemberActor): void {
  if (member.role !== 'owner') throw new ForbiddenError('Only a household owner can do that')
}
