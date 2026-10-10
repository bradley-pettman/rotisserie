import { PlannedMealSchemas } from '@rotisserie/shared/meals'
import z from 'zod'
import { getPlannedMealStrict } from '~/providers/planned-meals'
import { MemberActor } from '../actors'
import { defineUseCase } from '../define-use-case'

export const GetPlannedMealById = defineUseCase({
  actor: MemberActor,
  input: z.object({ id: z.uuid() }),
  output: PlannedMealSchemas.PlannedMeal,
  implementation: async ({ id }, { householdId }) => getPlannedMealStrict(householdId, id)
})
