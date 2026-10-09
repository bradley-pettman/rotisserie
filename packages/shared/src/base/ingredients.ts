import z from 'zod'
import type { InferSchemas } from '../lib/schemas'

const IngredientRaw = z.object({
  id: z.string(),
  name: z.string()
})

const Ingredient = IngredientRaw

export const IngredientSchemas = {
  IngredientRaw,
  Ingredient
}

export type IngredientSchemas = InferSchemas<typeof IngredientSchemas>
