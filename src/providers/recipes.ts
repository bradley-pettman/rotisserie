import type { RecipeSchemas } from '@rotisserie/shared/recipes'

export type UpsertRecipeInput = {
  id: string
  name: string
  instructions: string
  prepTimeMinutes: number | null
  cookTimeMinutes: number | null
  servings: number | null
  sourceUrl: string | null
  notes: string | null
  ingredients: {
    name: string
    quantity: number | null
    unit: string | null
    notes: string | null
  }[]
  tags: string[]
}

export type RecipePage = {
  recipes: RecipeSchemas['RecipeRaw'][]
  nextCursor: string | null
}

export async function getRecipe(id: string): Promise<RecipeSchemas['Recipe'] | null> {
  throw new Error('Not implemented: getRecipe')
}

export async function listRecipes(options: { q?: string; limit: number; cursor?: string }): Promise<RecipePage> {
  throw new Error('Not implemented: listRecipes')
}

export async function upsertRecipe(input: UpsertRecipeInput): Promise<RecipeSchemas['Recipe']> {
  throw new Error('Not implemented: upsertRecipe')
}

export async function deleteRecipe(id: string): Promise<boolean> {
  throw new Error('Not implemented: deleteRecipe')
}
