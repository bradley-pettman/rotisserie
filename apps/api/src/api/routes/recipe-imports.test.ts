import { describe, expect, it } from 'vitest'
import { createMember, createUser } from '~/test/accounts'
import { send } from '~/test/api'

function attempt(overrides: Record<string, unknown> = {}) {
  return {
    url: 'https://www.example.com/recipes/chili',
    outcome: 'partial',
    httpStatus: null,
    missingFields: ['steps', 'times'],
    ...overrides
  }
}

describe('POST /recipe-imports', () => {
  it('records an attempt with its host and lists it newest first', async () => {
    expect((await send('POST', '/recipe-imports', attempt())).status).toBe(204)
    await send(
      'POST',
      '/recipe-imports',
      attempt({ url: 'https://blocked.example.org/x', outcome: 'refused', httpStatus: 402, missingFields: [] })
    )

    const response = await send('GET', '/recipe-imports')

    expect(response).toMatchObject({
      status: 200,
      body: [
        {
          url: 'https://blocked.example.org/x',
          host: 'blocked.example.org',
          outcome: 'refused',
          httpStatus: 402,
          missingFields: []
        },
        {
          url: 'https://www.example.com/recipes/chili',
          host: 'example.com',
          outcome: 'partial',
          missingFields: ['steps', 'times']
        }
      ]
    })
  })

  it('filters by outcome and limits the list', async () => {
    await send('POST', '/recipe-imports', attempt({ outcome: 'imported', missingFields: [] }))
    await send('POST', '/recipe-imports', attempt({ outcome: 'timeout', missingFields: [] }))
    await send('POST', '/recipe-imports', attempt({ outcome: 'timeout', missingFields: [] }))

    expect((await send('GET', '/recipe-imports?outcome=timeout')).body).toHaveLength(2)
    expect((await send('GET', '/recipe-imports?limit=1')).body).toHaveLength(1)
  })

  it('returns 400 for an unknown outcome, field or scheme', async () => {
    expect((await send('POST', '/recipe-imports', attempt({ outcome: 'exploded' }))).status).toBe(400)
    expect((await send('POST', '/recipe-imports', attempt({ missingFields: ['photo'] }))).status).toBe(400)
    expect((await send('POST', '/recipe-imports', attempt({ url: 'ftp://example.com/x' }))).status).toBe(400)
    expect((await send('POST', '/recipe-imports', attempt({ httpStatus: 42 }))).status).toBe(400)
  })

  it('keeps each household to its own attempts', async () => {
    const neighbor = await createMember({ displayName: 'Neighbor' })
    await send('POST', '/recipe-imports', attempt())

    expect((await send('GET', '/recipe-imports', undefined, { as: neighbor })).body).toEqual([])
  })

  it('needs a household', async () => {
    const user = await createUser()

    expect((await send('POST', '/recipe-imports', attempt(), { as: user })).status).toBe(403)
    expect((await send('POST', '/recipe-imports', attempt(), { as: null })).status).toBe(401)
  })
})
