import { describe, expect, it } from 'vitest'
import { app } from '~/api/app'
import { DB } from '~/db/connection'
import { createUser, defaultMember } from '~/test/accounts'
import { send } from '~/test/api'

const anonymous = { as: null }

async function signUp(overrides: Record<string, unknown> = {}) {
  return send(
    'POST',
    '/auth/sign-up',
    { email: 'sam@example.com', password: 'correct horse battery', displayName: 'Sam', ...overrides },
    anonymous
  )
}

describe('POST /auth/sign-up', () => {
  it('creates an account with no household and signs it in', async () => {
    const response = await signUp({ email: '  Sam@Example.COM ' })

    expect(response).toMatchObject({
      status: 201,
      body: {
        token: expect.any(String),
        me: { user: { email: 'sam@example.com', displayName: 'Sam' }, household: null }
      }
    })
    expect(await send('GET', '/me', undefined, { as: response.body })).toMatchObject({
      status: 200,
      body: { user: { email: 'sam@example.com' } }
    })
  })

  it('stores a hash, never the password or the token', async () => {
    const { body } = await signUp()

    const user = await DB.queryOne<{ passwordHash: string }>(
      `SELECT password_hash AS "passwordHash" FROM users WHERE id = $1`,
      [body.me.user.id]
    )
    const session = await DB.queryOne<{ tokenHash: string }>(
      `SELECT token_hash AS "tokenHash" FROM sessions WHERE user_id = $1`,
      [body.me.user.id]
    )
    expect(user?.passwordHash).toMatch(/^\$scrypt\$/)
    expect(session?.tokenHash).not.toBe(body.token)
  })

  it('returns 409 for an email that already has an account', async () => {
    await signUp()

    expect(await signUp({ email: 'SAM@example.com' })).toMatchObject({ status: 409, body: { error: { code: 'conflict' } } })
  })

  it('returns 400 for a short password or a bad email', async () => {
    expect(await signUp({ password: 'short' })).toMatchObject({
      status: 400,
      body: { error: { fields: { password: [expect.any(String)] } } }
    })
    expect((await signUp({ email: 'not-an-email' })).status).toBe(400)
  })
})

describe('POST /auth/sign-in', () => {
  it('returns a new token and the household for the right password', async () => {
    await signUp()

    const response = await send(
      'POST',
      '/auth/sign-in',
      { email: 'sam@example.com', password: 'correct horse battery' },
      anonymous
    )

    expect(response).toMatchObject({ status: 200, body: { token: expect.any(String), me: { household: null } } })
  })

  it('returns the same 401 for a wrong password and an unknown email', async () => {
    await signUp()

    const wrongPassword = await send('POST', '/auth/sign-in', { email: 'sam@example.com', password: 'wrong' }, anonymous)
    const unknownEmail = await send('POST', '/auth/sign-in', { email: 'nobody@example.com', password: 'wrong' }, anonymous)

    expect(wrongPassword).toMatchObject({ status: 401, body: { error: { code: 'unauthenticated' } } })
    expect(unknownEmail).toEqual(wrongPassword)
  })
})

describe('POST /auth/sign-out', () => {
  it('ends only the session that signed out', async () => {
    const { body: first } = await signUp()
    const { body: second } = await send(
      'POST',
      '/auth/sign-in',
      { email: 'sam@example.com', password: 'correct horse battery' },
      anonymous
    )

    expect((await send('POST', '/auth/sign-out', undefined, { as: first })).status).toBe(204)

    expect((await send('GET', '/me', undefined, { as: first })).status).toBe(401)
    expect((await send('GET', '/me', undefined, { as: second })).status).toBe(200)
  })
})

describe('GET /me', () => {
  it('returns the user and their household', async () => {
    const member = defaultMember()

    expect(await send('GET', '/me')).toMatchObject({
      status: 200,
      body: {
        user: { id: member.userId, displayName: 'Default Owner' },
        household: { id: member.householdId, role: 'owner' }
      }
    })
  })

  it('returns 401 with a Bearer challenge without a token', async () => {
    const response = await app.request('/me')

    expect(response.status).toBe(401)
    expect(response.headers.get('WWW-Authenticate')).toBe('Bearer')
  })

  it('returns 401 for an unknown token', async () => {
    expect(await send('GET', '/me', undefined, { as: { token: 'made-up' } })).toMatchObject({
      status: 401,
      body: { error: { code: 'unauthenticated' } }
    })
  })

  it('returns 401 once the session has expired', async () => {
    const user = await createUser()
    await DB.query(`UPDATE sessions SET expires_at = NOW() - INTERVAL '1 second' WHERE id = $1`, [user.sessionId])

    expect((await send('GET', '/me', undefined, { as: user })).status).toBe(401)
  })

  it('pushes the expiry out when a day-old session is used', async () => {
    const user = await createUser()
    await DB.query(
      `UPDATE sessions SET last_used_at = NOW() - INTERVAL '2 days', expires_at = NOW() + INTERVAL '1 hour' WHERE id = $1`,
      [user.sessionId]
    )

    await send('GET', '/me', undefined, { as: user })

    const session = await DB.queryOne<{ extended: boolean }>(
      `SELECT expires_at > NOW() + INTERVAL '80 days' AS extended FROM sessions WHERE id = $1`,
      [user.sessionId]
    )
    expect(session?.extended).toBe(true)
  })
})

describe('signing in without a household', () => {
  it('can reach /me but not the household data', async () => {
    const user = await createUser()

    expect((await send('GET', '/me', undefined, { as: user })).body).toMatchObject({ household: null })
    expect(await send('GET', '/recipes', undefined, { as: user })).toMatchObject({
      status: 403,
      body: { error: { code: 'no_household' } }
    })
  })
})

describe('the data routes', () => {
  it.each([
    ['GET', '/recipes'],
    ['GET', '/ingredients'],
    ['GET', '/units'],
    ['GET', '/tags'],
    ['GET', '/meals?from=2026-10-01&to=2026-10-07'],
    ['GET', '/planned-meals/unscheduled'],
    ['GET', '/cooked-meals'],
    ['POST', '/cooked-meals/settle'],
    ['GET', '/household']
  ])('%s %s returns 401 without signing in', async (method, path) => {
    expect(await send(method, path, undefined, anonymous)).toMatchObject({
      status: 401,
      body: { error: { code: 'unauthenticated' } }
    })
  })
})
