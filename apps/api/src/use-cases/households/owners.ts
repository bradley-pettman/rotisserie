import type { HouseholdSchemas } from '@rotisserie/shared/accounts'

export function isLastOwner(household: HouseholdSchemas['Household'], userId: string): boolean {
  const owners = household.members.filter((member) => member.role === 'owner')
  return owners.length === 1 && owners[0]?.userId === userId
}
