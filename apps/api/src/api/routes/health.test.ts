import { describe, expect, it } from 'vitest'
import { send } from '~/test/api'

describe('GET /health', () => {
  it('returns 200 when the database is reachable, without signing in', async () => {
    expect(await send('GET', '/health', undefined, { as: null })).toEqual({ status: 200, body: { databaseReachable: true } })
  })
})

describe('unknown routes', () => {
  it('return the error envelope, signed in or not', async () => {
    const response = await send('GET', '/nope', undefined, { as: null })

    expect(response).toMatchObject({ status: 404, body: { error: { code: 'not_found' } } })
  })
})
