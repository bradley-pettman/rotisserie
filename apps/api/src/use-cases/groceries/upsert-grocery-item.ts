import { GrocerySchemas, groceryNameKeys } from '@rotisserie/shared/groceries'
import { getGroceryItem, rememberGroceryDefault, upsertGroceryItemStrict } from '~/providers/groceries'
import { MemberActor } from '../actors'
import { defineUseCase } from '../define-use-case'
import { resolveDefaults } from './list'

export const UpsertGroceryItem = defineUseCase({
  actor: MemberActor,
  input: GrocerySchemas.GroceryItemInput,
  output: GrocerySchemas.GroceryItem,
  implementation: async (input, { householdId }) => {
    const existing = await getGroceryItem(householdId, input.id)
    const fallback =
      input.storeId !== undefined && input.section !== undefined
        ? null
        : (existing ?? (await resolveDefaults(householdId, [input.text]))[0] ?? null)
    const saved = await upsertGroceryItemStrict(householdId, {
      ...input,
      storeId: input.storeId === undefined ? (fallback?.storeId ?? null) : input.storeId,
      section: input.section === undefined ? (fallback?.section ?? null) : input.section
    })
    const name = existing?.line?.name ?? groceryNameKeys(input.text)[0]
    if (name && (input.storeId !== undefined || input.section !== undefined)) {
      await rememberGroceryDefault(householdId, name, { storeId: input.storeId, section: input.section })
    }
    return saved
  }
})
