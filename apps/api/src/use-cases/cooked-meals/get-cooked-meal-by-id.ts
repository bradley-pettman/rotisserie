import { CookedMealSchemas } from '@rotisserie/shared/meals'
import z from 'zod'
import { getCookedMealStrict } from '~/providers/cooked-meals'
import { defineUseCase } from '../define-use-case'

export const GetCookedMealById = defineUseCase({
  input: z.object({ id: z.uuid() }),
  output: CookedMealSchemas.CookedMeal,
  implementation: async ({ id }) => getCookedMealStrict(id)
})
