import { AccountSchemas } from '@rotisserie/shared/accounts'
import { ImportAttemptSchemas } from '@rotisserie/shared/recipes'
import { promptHidden, request } from './api-client'

type ImportAttempt = ImportAttemptSchemas['ImportAttempt']

function describe(attempt: ImportAttempt): string {
  if (attempt.outcome === 'partial') return `partial, missing ${attempt.missingFields.join(', ')}`
  return attempt.httpStatus === null ? attempt.outcome : `${attempt.outcome} (${attempt.httpStatus})`
}

function report(attempts: ImportAttempt[]): void {
  const failed = attempts.filter((attempt) => attempt.outcome !== 'imported')
  console.log(`${attempts.length} imports, ${failed.length} failed or partial`)
  if (failed.length === 0) return

  const byHost = new Map<string, ImportAttempt[]>()
  for (const attempt of failed) byHost.set(attempt.host, [...(byHost.get(attempt.host) ?? []), attempt])
  const hosts = [...byHost.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))

  for (const [host, hostAttempts] of hosts) {
    console.log(`\n${host} (${hostAttempts.length})`)
    for (const attempt of hostAttempts)
      console.log(`  ${attempt.createdAt.slice(0, 10)}  ${describe(attempt)}  ${attempt.url}`)
  }
}

async function main(email: string | undefined, apiUrl = 'http://localhost:3000'): Promise<void> {
  if (email === undefined) {
    console.error('Usage: npm run import-report -w @rotisserie/api -- <email> [apiUrl]')
    process.exitCode = 1
    return
  }

  const password = process.env.ROTISSERIE_PASSWORD ?? (await promptHidden(`Password for ${email} at ${apiUrl}: `))
  const session = AccountSchemas.AuthSession.parse(await request(apiUrl, 'POST', '/auth/sign-in', { email, password }))
  const headers = { authorization: `Bearer ${session.token}` }

  try {
    if (session.me.household === null) {
      console.error(`${email} is not in a household yet. Start or join one in the app, then run this again.`)
      process.exitCode = 1
      return
    }

    const attempts = ImportAttemptSchemas.ImportAttempt.array().parse(
      await request(apiUrl, 'GET', '/recipe-imports?limit=500', undefined, headers)
    )
    report(attempts)
  } finally {
    await request(apiUrl, 'POST', '/auth/sign-out', undefined, headers)
  }
}

await main(process.argv[2], process.argv[3])
