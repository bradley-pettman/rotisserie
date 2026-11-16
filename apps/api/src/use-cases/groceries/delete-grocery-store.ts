import z from 'zod'
import { deleteGroceryStoreStrict } from '~/providers/groceries'
import { MemberActor } from '../actors'
import { defineUseCase } from '../define-use-case'

export const DeleteGroceryStore = defineUseCase({
  actor: MemberActor,
  input: z.object({ id: z.uuid() }),
  output: z.void(),
  implementation: async ({ id }, { householdId }) => {
    await deleteGroceryStoreStrict(householdId, id)
  }
})
