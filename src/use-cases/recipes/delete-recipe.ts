import z from 'zod'
import { deleteRecipeStrict } from '~/providers/recipes'
import { defineUseCase } from '../define-use-case'

export const DeleteRecipe = defineUseCase({
  input: z.object({ id: z.uuid() }),
  output: z.void(),
  implementation: async ({ id }) => {
    await deleteRecipeStrict(id)
  }
})
