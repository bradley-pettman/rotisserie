import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { AccountSchemas } from '@rotisserie/shared/accounts'
import { RecipeSchemas } from '@rotisserie/shared/recipes'

const RECIPES_FILE = join(import.meta.dirname, 'recipes.json')

type Headers = Record<string, string>

async function request(base: string, method: string, path: string, body?: unknown, headers: Headers = {}): Promise<unknown> {
  const response = await fetch(new URL(path, base), {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  if (!response.ok) throw new Error(`${method} ${path} failed with ${response.status}: ${await response.text()}`)
  return response.status === 204 ? null : response.json()
}

function promptHidden(label: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process
    let value = ''
    const finish = (outcome: () => void) => {
      stdin.setRawMode?.(false)
      stdin.pause()
      stdin.off('data', onData)
      stdout.write('\n')
      outcome()
    }
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') return finish(() => resolve(value))
        if (char === '\u0003') return finish(() => reject(new Error('Cancelled')))
        value = char === '\u007f' || char === '\b' ? value.slice(0, -1) : value + char
      }
    }
    stdout.write(label)
    stdin.setEncoding('utf8')
    stdin.setRawMode?.(true)
    stdin.resume()
    stdin.on('data', onData)
  })
}

async function main(email: string | undefined, apiUrl = 'http://localhost:3000'): Promise<void> {
  if (email === undefined) {
    console.error('Usage: npm run load-recipes -w @rotisserie/api -- <email> [apiUrl]')
    process.exitCode = 1
    return
  }

  const recipes = RecipeSchemas.UpsertRecipeInput.array().parse(JSON.parse(await readFile(RECIPES_FILE, 'utf8')))
  const password = process.env.ROTISSERIE_PASSWORD ?? (await promptHidden(`Password for ${email} at ${apiUrl}: `))
  const session = AccountSchemas.AuthSession.parse(await request(apiUrl, 'POST', '/auth/sign-in', { email, password }))
  const headers = { authorization: `Bearer ${session.token}` }

  try {
    if (session.me.household === null) {
      console.error(`${email} is not in a household yet. Start or join one in the app, then run this again.`)
      process.exitCode = 1
      return
    }

    for (const { id, ...recipe } of recipes) {
      await request(apiUrl, 'PUT', `/recipes/${id}`, recipe, headers)
      console.log(`saved ${recipe.name}`)
    }
    console.log(`${recipes.length} recipes in "${session.me.household.name}"`)
  } finally {
    await request(apiUrl, 'POST', '/auth/sign-out', undefined, headers)
  }
}

await main(process.argv[2], process.argv[3])
