import z from 'zod'
import { deletePlannedMealStrict } from '~/providers/planned-meals'
import { defineUseCase } from '../define-use-case'

export const DeletePlannedMeal = defineUseCase({
  input: z.object({ id: z.uuid() }),
  output: z.void(),
  implementation: async ({ id }) => {
    await deletePlannedMealStrict(id)
  }
})
