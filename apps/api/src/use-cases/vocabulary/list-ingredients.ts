import { IngredientSchemas } from '@rotisserie/shared/base'
import z from 'zod'
import { listIngredients } from '~/providers/vocabulary'
import { MemberActor } from '../actors'
import { defineUseCase } from '../define-use-case'

export const ListIngredients = defineUseCase({
  actor: MemberActor,
  input: z.object({
    q: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(10)
  }),
  output: IngredientSchemas.Ingredient.array(),
  implementation: async (input, { householdId }) => listIngredients(householdId, input)
})
