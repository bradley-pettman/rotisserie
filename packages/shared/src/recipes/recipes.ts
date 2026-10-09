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

const RecipeStats = z.object({
  averageRating: z.number().nullable(),
  ratingCount: z.number().int(),
  timesMade: z.number().int(),
  lastMadeOn: z.iso.date().nullable()
})

const RecipeWithStats = Recipe.extend({ stats: RecipeStats })

const UpsertRecipeInput = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(255),
  instructions: z.string(),
  prepTimeMinutes: z.number().int().min(0).nullable(),
  cookTimeMinutes: z.number().int().min(0).nullable(),
  servings: z.number().int().positive().nullable(),
  sourceUrl: z.url().nullable(),
  notes: z.string().nullable(),
  ingredients: z
    .object({
      name: z.string().trim().min(1).max(255),
      quantity: z.number().positive().nullable(),
      unit: z.string().trim().min(1).max(50).nullable(),
      notes: z.string().nullable()
    })
    .array(),
  tags: z.string().trim().min(1).max(100).array()
})

const RecipePage = z.object({
  recipes: RecipeRaw.array(),
  nextCursor: z.string().nullable()
})

const RecipeWithStatsPage = RecipePage.extend({
  recipes: RecipeRaw.extend({ stats: RecipeStats }).array()
})

export const RecipeSchemas = {
  RecipeRaw,
  Recipe,
  RecipeStats,
  RecipeWithStats,
  UpsertRecipeInput,
  RecipePage,
  RecipeWithStatsPage
}

export type RecipeSchemas = InferSchemas<typeof RecipeSchemas>
