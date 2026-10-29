import pg from 'pg'
import ca from '../../../api/certs/rds-global-bundle.pem'

export async function handler(): Promise<void> {
  const role = required('DB_APP_ROLE')
  const database = required('PGDATABASE')

  const client = new pg.Client({ ssl: { ca } })
  await client.connect()
  try {
    const roleId = pg.escapeIdentifier(role)
    const existing = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role])
    if (existing.rows.length === 0) await client.query(`CREATE ROLE ${roleId} WITH LOGIN`)
    await client.query(`GRANT rds_iam TO ${roleId}`)
    await client.query(`GRANT ALL PRIVILEGES ON DATABASE ${pg.escapeIdentifier(database)} TO ${roleId}`)
    await client.query(`GRANT ALL PRIVILEGES ON SCHEMA public TO ${roleId}`)
  } finally {
    await client.end()
  }
}

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}
