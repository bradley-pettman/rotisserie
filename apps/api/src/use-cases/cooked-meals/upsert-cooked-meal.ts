import { CookedMealSchemas } from '@rotisserie/shared/meals'
import { upsertCookedMeal } from '~/providers/cooked-meals'
import { defineUseCase } from '../define-use-case'

export const UpsertCookedMeal = defineUseCase({
  input: CookedMealSchemas.CookedMealInput,
  output: CookedMealSchemas.CookedMeal,
  implementation: async (input) => upsertCookedMeal(input)
})
