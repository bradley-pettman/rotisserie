import { GrocerySchemas } from '@rotisserie/shared/groceries'
import { upsertGroceryStoreStrict } from '~/providers/groceries'
import { MemberActor } from '../actors'
import { defineUseCase } from '../define-use-case'

export const UpsertGroceryStore = defineUseCase({
  actor: MemberActor,
  input: GrocerySchemas.GroceryStoreInput,
  output: GrocerySchemas.GroceryStore,
  implementation: async (input, { householdId }) => upsertGroceryStoreStrict(householdId, input)
})
