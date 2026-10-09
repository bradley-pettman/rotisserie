import { describe, expect, it } from 'vitest'
import { send } from '~/test/api'

describe('GET /health', () => {
  it('returns 200 when the database is reachable', async () => {
    expect(await send('GET', '/health')).toEqual({ status: 200, body: { databaseReachable: true } })
  })
})

describe('unknown routes', () => {
  it('return the error envelope', async () => {
    const response = await send('GET', '/nope')

    expect(response).toMatchObject({ status: 404, body: { error: { code: 'not_found' } } })
  })
})
