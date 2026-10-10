import { PlannedMealSchemas } from '@rotisserie/shared/meals'
import z from 'zod'
import { addPlannedDishStrict } from '~/providers/planned-meals'
import { MemberActor } from '../actors'
import { defineUseCase } from '../define-use-case'

export const AddPlannedDish = defineUseCase({
  actor: MemberActor,
  input: z.object({
    plannedMealId: z.uuid(),
    dish: PlannedMealSchemas.PlannedDishInput
  }),
  output: PlannedMealSchemas.PlannedMeal,
  implementation: async ({ plannedMealId, dish }, { householdId }) => addPlannedDishStrict(householdId, plannedMealId, dish)
})
