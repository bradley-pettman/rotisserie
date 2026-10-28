import { PlannedMealSchemas } from '@rotisserie/shared/meals'
import { upsertPlannedMealStrict } from '~/providers/planned-meals'
import { MemberActor } from '../actors'
import { defineUseCase } from '../define-use-case'

export const UpsertPlannedMeal = defineUseCase({
  actor: MemberActor,
  input: PlannedMealSchemas.PlannedMealInput,
  output: PlannedMealSchemas.PlannedMeal,
  implementation: async (input, { householdId }) => upsertPlannedMealStrict(householdId, input)
})
