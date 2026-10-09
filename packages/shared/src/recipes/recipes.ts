import z from 'zod'
import type { InferSchemas } from '../lib/schemas'
import { IngredientSchemas, TagSchemas, UnitSchemas } from '../base'

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
  ingredients: z
    .object({
      id: z.string(),
      ingredient: IngredientSchemas.Ingredient,
      quantity: z.number().nullable(),
      unit: UnitSchemas.Unit.nullable(),
      notes: z.string().nullable(),
      sortOrder: z.number().int()
    })
    .array(),
  tags: TagSchemas.Tag.array()
})

export const RecipeSchemas = {
  RecipeRaw,
  Recipe
}

export type RecipeSchemas = InferSchemas<typeof RecipeSchemas>
