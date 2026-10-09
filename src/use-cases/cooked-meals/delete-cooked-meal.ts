import z from 'zod'
import { deleteCookedMealStrict } from '~/providers/cooked-meals'
import { defineUseCase } from '../define-use-case'

export const DeleteCookedMeal = defineUseCase({
  input: z.object({ id: z.uuid() }),
  output: z.void(),
  implementation: async ({ id }) => {
    await deleteCookedMealStrict(id)
  }
})
