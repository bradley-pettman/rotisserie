import { CookedMealSchemas } from '@rotisserie/shared/meals'
import z from 'zod'
import { listCookedMeals } from '~/providers/cooked-meals'
import { defineUseCase } from '../define-use-case'

export const ListCookedMeals = defineUseCase({
  input: z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().optional()
  }),
  output: CookedMealSchemas.CookedMealPage,
  implementation: async (input) => listCookedMeals(input)
})
