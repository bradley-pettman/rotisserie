import z from 'zod'
import { deleteGroceryItemStrict } from '~/providers/groceries'
import { MemberActor } from '../actors'
import { defineUseCase } from '../define-use-case'

export const DeleteGroceryItem = defineUseCase({
  actor: MemberActor,
  input: z.object({ id: z.uuid() }),
  output: z.void(),
  implementation: async ({ id }, { householdId }) => {
    await deleteGroceryItemStrict(householdId, id)
  }
})
