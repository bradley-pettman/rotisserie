import { IngredientSchemas } from '@rotisserie/shared/base'
import z from 'zod'
import { listIngredients } from '~/providers/vocabulary'
import { defineUseCase } from '../define-use-case'

export const ListIngredients = defineUseCase({
  input: z.object({
    q: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(10)
  }),
  output: IngredientSchemas.Ingredient.array(),
  implementation: async (input) => listIngredients(input)
})
