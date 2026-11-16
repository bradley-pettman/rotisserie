import { GrocerySchemas } from '@rotisserie/shared/groceries'
import z from 'zod'
import { uncheckAllGroceryItems } from '~/providers/groceries'
import { MemberActor } from '../actors'
import { defineUseCase } from '../define-use-case'
import { loadGroceryList } from './list'

export const UncheckAllGroceryItems = defineUseCase({
  actor: MemberActor,
  input: z.object({}),
  output: GrocerySchemas.GroceryList,
  implementation: async (_input, { householdId }) => {
    await uncheckAllGroceryItems(householdId)
    return loadGroceryList(householdId)
  }
})
