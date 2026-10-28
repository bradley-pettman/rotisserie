import z from 'zod'
import { deleteRecipeStrict } from '~/providers/recipes'
import { MemberActor } from '../actors'
import { defineUseCase } from '../define-use-case'

export const DeleteRecipe = defineUseCase({
  actor: MemberActor,
  input: z.object({ id: z.uuid() }),
  output: z.void(),
  implementation: async ({ id }, { householdId }) => {
    await deleteRecipeStrict(householdId, id)
  }
})
