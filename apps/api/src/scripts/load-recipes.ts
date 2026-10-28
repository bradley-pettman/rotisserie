import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { RecipeSchemas } from '@rotisserie/shared/recipes'
import { pool } from '~/db/connection'
import { createEmptyHousehold, getHousehold, listHouseholds } from '~/providers/households'
import { upsertRecipe } from '~/providers/recipes'

const RECIPES_FILE = join(import.meta.dirname, 'recipes.json')

async function findHousehold(householdId: string | undefined): Promise<{ id: string; name: string } | null> {
  if (householdId !== undefined) return getHousehold(householdId)

  const households = await listHouseholds()
  if (households.length === 0) {
    const created = await createEmptyHousehold('Home')
    console.log(`Created household "Home". Run npm run invite -w @rotisserie/api for a code to join it.`)
    return created
  }
  if (households.length > 1) {
    console.error('More than one household. Pass one of these ids:')
    for (const candidate of households) console.error(`  ${candidate.id}  ${candidate.name}`)
    return null
  }
  return households[0] ?? null
}

async function main(householdId: string | undefined): Promise<void> {
  const recipes = RecipeSchemas.UpsertRecipeInput.array().parse(JSON.parse(await readFile(RECIPES_FILE, 'utf8')))
  const household = await findHousehold(householdId)
  if (household === null) {
    process.exitCode = 1
    return
  }

  for (const recipe of recipes) {
    const saved = await upsertRecipe(household.id, recipe)
    console.log(saved === null ? `skipped ${recipe.name}: its id belongs to another household` : `saved ${recipe.name}`)
  }
  console.log(`${recipes.length} recipes in "${household.name}"`)
}

try {
  await main(process.argv[2])
} finally {
  await pool.end()
}
