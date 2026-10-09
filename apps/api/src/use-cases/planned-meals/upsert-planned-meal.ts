import { PlannedMealSchemas } from '@rotisserie/shared/meals'
import { upsertPlannedMeal } from '~/providers/planned-meals'
import { defineUseCase } from '../define-use-case'

export const UpsertPlannedMeal = defineUseCase({
  input: PlannedMealSchemas.PlannedMealInput,
  output: PlannedMealSchemas.PlannedMeal,
  implementation: async (input) => upsertPlannedMeal(input)
})
