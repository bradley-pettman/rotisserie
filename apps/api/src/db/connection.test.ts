import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'

const CA_BUNDLE = fileURLToPath(new URL('../../certs/rds-global-bundle.pem', import.meta.url))

describe('connection without DATABASE_URL', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('signs in with an IAM token per connection and verifies the RDS certificate', async () => {
    vi.resetModules()
    vi.stubEnv('DATABASE_URL', '')
    vi.stubEnv('PGHOST', 'db.example.internal')
    vi.stubEnv('PGPORT', '5432')
    vi.stubEnv('PGUSER', 'app')
    vi.stubEnv('PGDATABASE', 'rotisserie')
    vi.stubEnv('PGSSLROOTCERT', CA_BUNDLE)
    vi.stubEnv('AWS_REGION', 'us-east-2')

    const { pool } = await import('./connection')
    try {
      const options = pool.options as { host?: string; user?: string; database?: string; password?: unknown; ssl?: unknown }
      expect(options.host).toBe('db.example.internal')
      expect(options.user).toBe('app')
      expect(options.database).toBe('rotisserie')
      expect(typeof options.password).toBe('function')
      expect(options.ssl).toMatchObject({ ca: expect.stringContaining('BEGIN CERTIFICATE') })
    } finally {
      await pool.end()
    }
  })

  it('refuses to start without the variables it needs', async () => {
    vi.resetModules()
    vi.stubEnv('DATABASE_URL', '')
    vi.stubEnv('PGHOST', '')

    await expect(import('./connection')).rejects.toThrow('PGHOST is not set')
  })
})
