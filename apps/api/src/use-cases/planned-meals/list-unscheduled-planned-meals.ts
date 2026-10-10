import { PlannedMealSchemas } from '@rotisserie/shared/meals'
import z from 'zod'
import { listUnscheduledPlannedMeals } from '~/providers/planned-meals'
import { MemberActor } from '../actors'
import { defineUseCase } from '../define-use-case'

export const ListUnscheduledPlannedMeals = defineUseCase({
  actor: MemberActor,
  input: z.object({}),
  output: PlannedMealSchemas.PlannedMeal.array(),
  implementation: async (_input, { householdId }) => listUnscheduledPlannedMeals(householdId)
})
