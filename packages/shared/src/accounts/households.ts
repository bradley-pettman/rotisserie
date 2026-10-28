import z from 'zod'
import type { InferSchemas } from '../lib/schemas'
import { canonicalizeInviteCode, isInviteCode } from './invite-codes'

const HouseholdRole = z.enum(['owner', 'member'])

const HouseholdMember = z.object({
  userId: z.string(),
  displayName: z.string(),
  email: z.string(),
  role: HouseholdRole,
  joinedAt: z.iso.datetime()
})

const Household = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.iso.datetime(),
  members: HouseholdMember.array()
})

const HouseholdInvite = z.object({
  id: z.string(),
  code: z.string(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime()
})

const HouseholdName = z.string().trim().min(1).max(100)

const InviteCode = z
  .string()
  .transform(canonicalizeInviteCode)
  .refine(isInviteCode, { message: 'An invite code is 8 letters and numbers' })

const CreateHouseholdInput = z.object({ name: HouseholdName })

const RenameHouseholdInput = z.object({ name: HouseholdName })

const JoinHouseholdInput = z.object({ code: InviteCode })

const ChangeMemberRoleInput = z.object({ userId: z.uuid(), role: HouseholdRole })

export const HouseholdSchemas = {
  HouseholdRole,
  HouseholdMember,
  Household,
  HouseholdInvite,
  CreateHouseholdInput,
  RenameHouseholdInput,
  JoinHouseholdInput,
  ChangeMemberRoleInput
}

export type HouseholdSchemas = InferSchemas<typeof HouseholdSchemas>
