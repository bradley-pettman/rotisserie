import { describe, expect, it } from 'vitest'
import { handler } from './lambda'

function event(method: string, path: string) {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: path,
    rawQueryString: '',
    headers: { host: 'api.example.com' },
    body: null,
    requestContext: {
      accountId: '123456789012',
      apiId: 'api',
      authentication: null,
      authorizer: {},
      domainName: 'api.example.com',
      domainPrefix: 'api',
      http: { method, path, protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'vitest' },
      requestId: 'request',
      routeKey: '$default',
      stage: '$default',
      time: '29/Oct/2026:00:00:00 +0000',
      timeEpoch: 0
    },
    isBase64Encoded: false
  }
}

describe('lambda handler', () => {
  it('serves the Hono app from an HTTP API event', async () => {
    const response = await handler(event('GET', '/health'))

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toMatchObject({ databaseReachable: true })
  })

  it('keeps the error envelope', async () => {
    const response = await handler(event('GET', '/nowhere'))

    expect(response.statusCode).toBe(404)
    expect(JSON.parse(response.body)).toMatchObject({ error: { code: expect.any(String) } })
  })
})
