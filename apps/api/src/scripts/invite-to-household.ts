import { formatInviteCode } from '@rotisserie/shared/accounts'
import { generateInviteCode } from '~/auth/tokens'
import { pool } from '~/db/connection'
import { createInvite, getHousehold, listHouseholdsWithoutMembers } from '~/providers/households'

async function findHouseholds(householdId: string | undefined): Promise<{ id: string; name: string }[]> {
  if (householdId === undefined) return listHouseholdsWithoutMembers()
  const household = await getHousehold(householdId)
  return household === null ? [] : [household]
}

async function main(householdId: string | undefined): Promise<void> {
  const households = await findHouseholds(householdId)
  const [household] = households

  if (household === undefined) {
    console.error('No household to invite to. Pass a household id, or migrate a database that already has data.')
    process.exitCode = 1
    return
  }
  if (households.length > 1) {
    console.error(`More than one household has no members. Pass one of these ids:`)
    for (const candidate of households) console.error(`  ${candidate.id}  ${candidate.name}`)
    process.exitCode = 1
    return
  }

  const invite = await createInvite({
    householdId: household.id,
    createdBy: null,
    code: generateInviteCode(),
    inviteDays: 7
  })
  console.log(`Invite code for "${household.name}": ${formatInviteCode(invite.code)} (expires ${invite.expiresAt})`)
}

try {
  await main(process.argv[2])
} finally {
  await pool.end()
}
