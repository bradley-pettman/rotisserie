import z from 'zod'
import type { InferSchemas } from '../lib/schemas'
import { MealSlot } from './meal-slot'

const CookedMealRaw = z.object({
  id: z.string(),
  plannedMealId: z.string().nullable(),
  cookedOn: z.iso.date(),
  mealSlot: MealSlot,
  headcount: z.number().int().nullable(),
  notes: z.string().nullable(),
  createdAt: z.iso.datetime()
})

const CookedMeal = CookedMealRaw.extend({
  dishes: z
    .object({
      id: z.string(),
      recipeId: z.string().nullable(),
      label: z.string(),
      isLeftovers: z.boolean(),
      notes: z.string().nullable(),
      sortOrder: z.number().int()
    })
    .array()
})

export const CookedMealSchemas = {
  CookedMealRaw,
  CookedMeal
}

export type CookedMealSchemas = InferSchemas<typeof CookedMealSchemas>
