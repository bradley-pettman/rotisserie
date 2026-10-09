import z from 'zod'
import type { InferSchemas } from '../lib/schemas'
import { RecipeSchemas } from '../recipes'
import { MealSlot } from './meal-slot'

const PlannedMealRaw = z.object({
  id: z.string(),
  plannedOn: z.iso.date(),
  mealSlot: MealSlot,
  headcount: z.number().int().nullable(),
  notes: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
})

const PlannedMeal = PlannedMealRaw.extend({
  dishes: z
    .object({
      id: z.string(),
      // A plan reads the recipe as it is today, so the recipe is joined live.
      recipe: RecipeSchemas.RecipeRaw.nullable(),
      customText: z.string().nullable(),
      notes: z.string().nullable(),
      sortOrder: z.number().int()
    })
    .array()
})

export const PlannedMealSchemas = {
  PlannedMealRaw,
  PlannedMeal
}

export type PlannedMealSchemas = InferSchemas<typeof PlannedMealSchemas>
