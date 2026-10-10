import z from 'zod'
import { deleteCookedMealStrict } from '~/providers/cooked-meals'
import { MemberActor } from '../actors'
import { defineUseCase } from '../define-use-case'

export const DeleteCookedMeal = defineUseCase({
  actor: MemberActor,
  input: z.object({ id: z.uuid() }),
  output: z.void(),
  implementation: async ({ id }, { householdId }) => {
    await deleteCookedMealStrict(householdId, id)
  }
})
