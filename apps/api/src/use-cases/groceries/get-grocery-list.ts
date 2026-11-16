import { GrocerySchemas } from '@rotisserie/shared/groceries'
import z from 'zod'
import { MemberActor } from '../actors'
import { defineUseCase } from '../define-use-case'
import { loadGroceryList } from './list'

export const GetGroceryList = defineUseCase({
  actor: MemberActor,
  input: z.object({}),
  output: GrocerySchemas.GroceryList,
  implementation: async (_input, { householdId }) => loadGroceryList(householdId)
})
