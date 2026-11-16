import { GrocerySchemas } from '@rotisserie/shared/groceries'
import z from 'zod'
import { deleteCheckedGroceryItems } from '~/providers/groceries'
import { MemberActor } from '../actors'
import { defineUseCase } from '../define-use-case'
import { loadGroceryList } from './list'

export const DeleteCheckedGroceryItems = defineUseCase({
  actor: MemberActor,
  input: z.object({}),
  output: GrocerySchemas.GroceryList,
  implementation: async (_input, { householdId }) => {
    await deleteCheckedGroceryItems(householdId)
    return loadGroceryList(householdId)
  }
})
