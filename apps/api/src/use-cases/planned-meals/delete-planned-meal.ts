import z from 'zod'
import { deletePlannedMealStrict } from '~/providers/planned-meals'
import { MemberActor } from '../actors'
import { defineUseCase } from '../define-use-case'

export const DeletePlannedMeal = defineUseCase({
  actor: MemberActor,
  input: z.object({ id: z.uuid() }),
  output: z.void(),
  implementation: async ({ id }, { householdId }) => {
    await deletePlannedMealStrict(householdId, id)
  }
})
