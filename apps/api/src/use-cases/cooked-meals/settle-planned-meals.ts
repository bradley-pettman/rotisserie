import { CookedMealSchemas } from '@rotisserie/shared/meals'
import z from 'zod'
import { settlePlannedMealsBefore } from '~/providers/cooked-meals'
import { defineUseCase } from '../define-use-case'

export const SettlePlannedMeals = defineUseCase({
  input: z.object({ before: z.iso.date() }),
  output: CookedMealSchemas.CookedMeal.array(),
  implementation: async ({ before }) => settlePlannedMealsBefore(before)
})
