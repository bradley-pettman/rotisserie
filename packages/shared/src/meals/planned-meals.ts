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
      recipe: RecipeSchemas.RecipeRaw.nullable(),
      customText: z.string().nullable(),
      notes: z.string().nullable(),
      sortOrder: z.number().int()
    })
    .array()
})

const PlannedDishInput = z
  .object({
    id: z.uuid(),
    recipeId: z.uuid().nullable(),
    customText: z.string().trim().min(1).nullable(),
    notes: z.string().nullable()
  })
  .refine((dish) => dish.recipeId !== null || dish.customText !== null, {
    message: 'A dish needs a recipe or custom text',
    path: ['customText']
  })

const PlannedMealInput = z.object({
  id: z.uuid(),
  plannedOn: z.iso.date(),
  mealSlot: MealSlot,
  headcount: z.number().int().positive().nullable(),
  notes: z.string().nullable(),
  dishes: PlannedDishInput.array()
})

export const PlannedMealSchemas = {
  PlannedMealRaw,
  PlannedMeal,
  PlannedDishInput,
  PlannedMealInput
}

export type PlannedMealSchemas = InferSchemas<typeof PlannedMealSchemas>
