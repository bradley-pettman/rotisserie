import type { HouseholdSchemas } from '@rotisserie/shared/accounts'
import { DB, type QueryFns } from '~/db/connection'
import { strict } from './errors'
import { isoTimestamp } from './sql'

type Household = HouseholdSchemas['Household']
type HouseholdInvite = HouseholdSchemas['HouseholdInvite']
type HouseholdRole = HouseholdSchemas['HouseholdRole']

const HOUSEHOLD_SELECT = `
  SELECT
    h.id,
    h.name,
    ${isoTimestamp('h.created_at')} AS "createdAt",
    COALESCE(
      (
        SELECT json_agg(
          json_build_object(
            'userId', u.id,
            'displayName', u.display_name,
            'email', u.email,
            'role', m.role,
            'joinedAt', ${isoTimestamp('m.joined_at')}
          )
          ORDER BY m.joined_at, u.id
        )
        FROM household_members m
        JOIN users u ON u.id = m.user_id
        WHERE m.household_id = h.id
      ),
      '[]'::json
    ) AS members
  FROM households h`

const INVITE_COLUMNS = `id, code, ${isoTimestamp('created_at')} AS "createdAt", ${isoTimestamp('expires_at')} AS "expiresAt"`

async function fetchHousehold(db: QueryFns, householdId: string): Promise<Household | null> {
  return db.queryOne<Household>(`${HOUSEHOLD_SELECT} WHERE h.id = $1`, [householdId])
}

export async function getHousehold(householdId: string): Promise<Household | null> {
  return fetchHousehold(DB, householdId)
}

export const getHouseholdStrict = strict(getHousehold, 'Household')

export async function listHouseholdsWithoutMembers(): Promise<{ id: string; name: string }[]> {
  return DB.query<{ id: string; name: string }>(
    `SELECT h.id, h.name
     FROM households h
     WHERE NOT EXISTS (SELECT 1 FROM household_members m WHERE m.household_id = h.id)
     ORDER BY h.created_at, h.id`
  )
}

export async function findMembership(userId: string): Promise<{ householdId: string; role: HouseholdRole } | null> {
  return DB.queryOne<{ householdId: string; role: HouseholdRole }>(
    `SELECT household_id AS "householdId", role FROM household_members WHERE user_id = $1`,
    [userId]
  )
}

export async function createHousehold(userId: string, name: string): Promise<Household> {
  return DB.withTransaction(async (tx) => {
    const created = await tx.queryOne<{ id: string }>(`INSERT INTO households (name) VALUES ($1) RETURNING id`, [name])
    if (created === null) throw new Error(`Household ${name} missing after insert`)

    await tx.query(`INSERT INTO household_members (household_id, user_id, role) VALUES ($1, $2, 'owner')`, [
      created.id,
      userId
    ])

    const household = await fetchHousehold(tx, created.id)
    if (household === null) throw new Error(`Household ${created.id} missing after insert`)
    return household
  })
}

export async function renameHousehold(householdId: string, name: string): Promise<{ id: string } | null> {
  return DB.queryOne<{ id: string }>(`UPDATE households SET name = $2, updated_at = NOW() WHERE id = $1 RETURNING id`, [
    householdId,
    name
  ])
}

export async function deleteHousehold(householdId: string): Promise<{ id: string } | null> {
  return DB.queryOne<{ id: string }>(`DELETE FROM households WHERE id = $1 RETURNING id`, [householdId])
}

export const deleteHouseholdStrict = strict(deleteHousehold, 'Household')

export async function setMemberRole(
  householdId: string,
  userId: string,
  role: HouseholdRole
): Promise<{ userId: string } | null> {
  return DB.queryOne<{ userId: string }>(
    `UPDATE household_members SET role = $3 WHERE household_id = $1 AND user_id = $2 RETURNING user_id AS "userId"`,
    [householdId, userId, role]
  )
}

export async function removeMember(householdId: string, userId: string): Promise<{ userId: string } | null> {
  return DB.queryOne<{ userId: string }>(
    `DELETE FROM household_members WHERE household_id = $1 AND user_id = $2 RETURNING user_id AS "userId"`,
    [householdId, userId]
  )
}

export async function createInvite(input: {
  householdId: string
  createdBy: string | null
  code: string
  inviteDays: number
}): Promise<HouseholdInvite> {
  const invite = await DB.queryOne<HouseholdInvite>(
    `WITH expired AS (
       DELETE FROM household_invites WHERE expires_at <= NOW()
     )
     INSERT INTO household_invites (household_id, created_by, code, expires_at)
     VALUES ($1, $2, $3, NOW() + $4 * INTERVAL '1 day')
     RETURNING ${INVITE_COLUMNS}`,
    [input.householdId, input.createdBy, input.code, input.inviteDays]
  )
  if (invite === null) throw new Error(`Invite for household ${input.householdId} missing after insert`)
  return invite
}

export async function listInvites(householdId: string): Promise<HouseholdInvite[]> {
  return DB.query<HouseholdInvite>(
    `SELECT ${INVITE_COLUMNS}
     FROM household_invites
     WHERE household_id = $1 AND expires_at > NOW()
     ORDER BY created_at, id`,
    [householdId]
  )
}

export async function deleteInvite(householdId: string, inviteId: string): Promise<{ id: string } | null> {
  return DB.queryOne<{ id: string }>(`DELETE FROM household_invites WHERE household_id = $1 AND id = $2 RETURNING id`, [
    householdId,
    inviteId
  ])
}

export const deleteInviteStrict = strict(deleteInvite, 'Invite')

export async function redeemInvite(userId: string, code: string): Promise<Household | null> {
  return DB.withTransaction(async (tx) => {
    const invite = await tx.queryOne<{ householdId: string }>(
      `DELETE FROM household_invites WHERE code = $1 AND expires_at > NOW() RETURNING household_id AS "householdId"`,
      [code]
    )
    if (invite === null) return null

    await tx.query(
      `INSERT INTO household_members (household_id, user_id, role)
       SELECT $1, $2, CASE WHEN EXISTS (SELECT 1 FROM household_members WHERE household_id = $1) THEN 'member' ELSE 'owner' END`,
      [invite.householdId, userId]
    )

    return fetchHousehold(tx, invite.householdId)
  })
}
