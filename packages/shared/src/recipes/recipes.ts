import z from 'zod'
import type { InferSchemas } from '../lib/schemas'
import { IngredientSchemas, UnitSchemas } from '../base'

// "Raw" zod models are the raw form from the database
// Named zod models are the parsed form used by the app

const RecipeRaw = z.object({
  id: z.string(),
  name: z.string(),
  instructions: z.string().nullable(),
  prepTimeMinutes: z.number().int().nullable(),
  cookTimeMinutes: z.number().int().nullable(),
  servings: z.number().int().nullable(),
  sourceUrl: z.url().nullable(),
  notes: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
})

const Recipe = RecipeRaw.extend({
  recipeIngredients: z.object({ ingredient: IngredientSchemas.Ingredient, quantity: z.number(), unit: UnitSchemas.Unit })
})

export const RecipeSchemas = {
  RecipeRaw,
  Recipe
}

export type RecipeSchemas = InferSchemas<typeof RecipeSchemas>
