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
  starRating: z.number().int().nullable(),
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

const CookedDishInput = z
  .object({
    recipeId: z.uuid().nullable(),
    label: z.string().trim().min(1).max(255).optional(),
    isLeftovers: z.boolean(),
    notes: z.string().nullable()
  })
  .refine((dish) => dish.recipeId !== null || dish.label !== undefined, {
    message: 'A dish needs a recipe or a label',
    path: ['label']
  })

const CookedMealInput = z.object({
  id: z.uuid(),
  plannedMealId: z.uuid().nullable(),
  cookedOn: z.iso.date(),
  mealSlot: MealSlot,
  headcount: z.number().int().positive().nullable(),
  notes: z.string().nullable(),
  starRating: z.number().int().min(1).max(5).nullable(),
  dishes: CookedDishInput.array()
})

const CookedMealPage = z.object({
  meals: CookedMeal.array(),
  nextCursor: z.string().nullable()
})

export const CookedMealSchemas = {
  CookedMealRaw,
  CookedMeal,
  CookedDishInput,
  CookedMealInput,
  CookedMealPage
}

export type CookedMealSchemas = InferSchemas<typeof CookedMealSchemas>
