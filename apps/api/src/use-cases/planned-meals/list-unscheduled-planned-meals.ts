import { PlannedMealSchemas } from '@rotisserie/shared/meals'
import z from 'zod'
import { listUnscheduledPlannedMeals } from '~/providers/planned-meals'
import { defineUseCase } from '../define-use-case'

export const ListUnscheduledPlannedMeals = defineUseCase({
  input: z.object({}),
  output: PlannedMealSchemas.PlannedMeal.array(),
  implementation: async () => listUnscheduledPlannedMeals()
})
