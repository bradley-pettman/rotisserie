import z from 'zod'

export const MealSlot = z.enum(['breakfast', 'lunch', 'dinner', 'snack'])

export type MealSlot = z.infer<typeof MealSlot>
