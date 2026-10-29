import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Signer } from '@aws-sdk/rds-signer'
import pg from 'pg'

export async function handler(): Promise<void> {
  const root = process.env.LAMBDA_TASK_ROOT ?? process.cwd()
  const host = required('PGHOST')
  const port = Number(required('PGPORT'))
  const user = required('PGUSER')
  const database = required('PGDATABASE')
  const ca = resolve(root, required('PGSSLROOTCERT'))
  const migrations = resolve(root, required('DBMATE_MIGRATIONS_DIR'))

  const token = await new Signer({ hostname: host, port, username: user, region: required('AWS_REGION') }).getAuthToken()

  const url =
    `postgres://${encodeURIComponent(user)}:${encodeURIComponent(token)}@${host}:${port}/${encodeURIComponent(database)}` +
    `?sslmode=verify-full&sslrootcert=${encodeURIComponent(ca)}`

  execFileSync(join(root, 'dbmate'), ['--migrations-dir', migrations, '--no-dump-schema', 'migrate'], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit'
  })

  if (process.env.SEEDS_DIR) await seed(resolve(root, process.env.SEEDS_DIR), { host, port, user, database, token, ca })
}

interface Connection {
  host: string
  port: number
  user: string
  database: string
  token: string
  ca: string
}

async function seed(dir: string, { host, port, user, database, token, ca }: Connection): Promise<void> {
  const files = readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort()

  const client = new pg.Client({ host, port, user, database, password: token, ssl: { ca: readFileSync(ca, 'utf8') } })
  await client.connect()
  try {
    await client.query('BEGIN')
    for (const file of files) {
      await client.query(readFileSync(join(dir, file), 'utf8'))
      console.log(`seeded ${file}`)
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    await client.end()
  }
}

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}
