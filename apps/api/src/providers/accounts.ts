import type { AccountSchemas, HouseholdSchemas } from '@rotisserie/shared/accounts'
import { DB } from '~/db/connection'
import { strict } from './errors'
import { isoTimestamp } from './sql'

export type SessionRow = {
  sessionId: string
  userId: string
  householdId: string | null
  role: HouseholdSchemas['HouseholdRole'] | null
  lastUsedAt: string
}

const USER_COLUMNS = `id, email, display_name AS "displayName"`

export async function createUserWithSession(input: {
  email: string
  displayName: string
  passwordHash: string
  tokenHash: string
  sessionDays: number
}): Promise<AccountSchemas['User']> {
  return DB.withTransaction(async (tx) => {
    const user = await tx.queryOne<AccountSchemas['User']>(
      `INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, $3) RETURNING ${USER_COLUMNS}`,
      [input.email, input.displayName, input.passwordHash]
    )
    if (user === null) throw new Error(`User ${input.email} missing after insert`)

    await tx.query(`INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + $3 * INTERVAL '1 day')`, [
      user.id,
      input.tokenHash,
      input.sessionDays
    ])
    return user
  })
}

export async function findCredentials(email: string): Promise<{ userId: string; passwordHash: string } | null> {
  return DB.queryOne<{ userId: string; passwordHash: string }>(
    `SELECT id AS "userId", password_hash AS "passwordHash" FROM users WHERE email = $1`,
    [email]
  )
}

export async function createSession(userId: string, tokenHash: string, sessionDays: number): Promise<void> {
  await DB.query(`INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + $3 * INTERVAL '1 day')`, [
    userId,
    tokenHash,
    sessionDays
  ])
}

export async function findSession(tokenHash: string): Promise<SessionRow | null> {
  return DB.queryOne<SessionRow>(
    `SELECT
       s.id AS "sessionId",
       s.user_id AS "userId",
       m.household_id AS "householdId",
       m.role,
       ${isoTimestamp('s.last_used_at')} AS "lastUsedAt"
     FROM sessions s
     LEFT JOIN household_members m ON m.user_id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [tokenHash]
  )
}

export async function extendSession(sessionId: string, sessionDays: number): Promise<void> {
  await DB.query(`UPDATE sessions SET last_used_at = NOW(), expires_at = NOW() + $2 * INTERVAL '1 day' WHERE id = $1`, [
    sessionId,
    sessionDays
  ])
}

export async function deleteSession(sessionId: string): Promise<void> {
  await DB.query(`DELETE FROM sessions WHERE id = $1`, [sessionId])
}

export async function getMe(userId: string): Promise<AccountSchemas['Me'] | null> {
  return DB.queryOne<AccountSchemas['Me']>(
    `SELECT
       json_build_object('id', u.id, 'email', u.email, 'displayName', u.display_name) AS user,
       CASE WHEN h.id IS NULL THEN NULL ELSE json_build_object('id', h.id, 'name', h.name, 'role', m.role) END AS household
     FROM users u
     LEFT JOIN household_members m ON m.user_id = u.id
     LEFT JOIN households h ON h.id = m.household_id
     WHERE u.id = $1`,
    [userId]
  )
}

export const getMeStrict = strict(getMe, 'User')
