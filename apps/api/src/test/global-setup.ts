import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import pg from 'pg'
import { TEST_DATABASE_URL } from './database-url'

const MIGRATIONS_DIR = join(import.meta.dirname, '../../../../db/migrations')

export default async function setup(): Promise<void> {
  const url = new URL(TEST_DATABASE_URL)
  const database = url.pathname.slice(1)
  if (!database.endsWith('_test')) {
    throw new Error(`Refusing to recreate "${database}": the test database name must end in _test`)
  }

  const adminUrl = new URL(url)
  adminUrl.pathname = '/postgres'
  const admin = new pg.Client({ connectionString: adminUrl.toString() })
  await admin.connect()
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
    await admin.query(`CREATE DATABASE "${database}"`)
  } finally {
    await admin.end()
  }

  const client = new pg.Client({ connectionString: url.toString() })
  await client.connect()
  try {
    const files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith('.sql')).sort()
    const migrations = await Promise.all(files.map((file) => readFile(join(MIGRATIONS_DIR, file), 'utf8')))
    await client.query(migrations.map((sql) => sql.split('-- migrate:down')[0] ?? '').join('\n'))
  } finally {
    await client.end()
  }
}
