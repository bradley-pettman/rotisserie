import { randomUUID } from 'node:crypto'
import type { HouseholdSchemas } from '@rotisserie/shared/accounts'
import { generateSessionToken, hashToken } from '~/auth/tokens'
import { DB } from '~/db/connection'

export type TestUser = { userId: string; sessionId: string; token: string; email: string }

export type TestMember = TestUser & { householdId: string; role: HouseholdSchemas['HouseholdRole'] }

let current: TestMember | undefined

export function defaultMember(): TestMember {
  if (current === undefined) throw new Error('No default member: src/test/setup.ts creates one before each test')
  return current
}

export async function resetDefaultMember(): Promise<void> {
  current = await createMember({ displayName: 'Default Owner' })
}

export async function createHousehold(name = 'Test household'): Promise<string> {
  const household = await DB.queryOne<{ id: string }>(`INSERT INTO households (name) VALUES ($1) RETURNING id`, [name])
  if (household === null) throw new Error('Household missing after insert')
  return household.id
}

export async function createUser(overrides: { email?: string; displayName?: string } = {}): Promise<TestUser> {
  const email = overrides.email ?? `${randomUUID()}@example.com`
  const token = generateSessionToken()
  const user = await DB.queryOne<{ id: string }>(
    `INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, 'not-a-real-hash') RETURNING id`,
    [email, overrides.displayName ?? 'Test User']
  )
  if (user === null) throw new Error('User missing after insert')

  const session = await DB.queryOne<{ id: string }>(
    `INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '1 day') RETURNING id`,
    [user.id, hashToken(token)]
  )
  if (session === null) throw new Error('Session missing after insert')

  return { userId: user.id, sessionId: session.id, token, email }
}

export async function createMember(
  options: { householdId?: string; role?: HouseholdSchemas['HouseholdRole']; email?: string; displayName?: string } = {}
): Promise<TestMember> {
  const householdId = options.householdId ?? (await createHousehold())
  const role = options.role ?? (options.householdId === undefined ? 'owner' : 'member')
  const user = await createUser(options)
  await DB.query(`INSERT INTO household_members (household_id, user_id, role) VALUES ($1, $2, $3)`, [
    householdId,
    user.userId,
    role
  ])
  return { ...user, householdId, role }
}
