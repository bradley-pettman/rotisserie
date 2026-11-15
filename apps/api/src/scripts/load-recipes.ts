import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { AccountSchemas } from '@rotisserie/shared/accounts'
import { RecipeSchemas } from '@rotisserie/shared/recipes'
import { promptHidden, request } from './api-client'

const RECIPES_FILE = join(import.meta.dirname, 'recipes.json')

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
