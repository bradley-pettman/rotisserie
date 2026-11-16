import { findListedItem, GrocerySchemas } from '@rotisserie/shared/groceries'
import { listGroceryItems, listListedMeals } from '~/providers/groceries'
import { MemberActor } from '../actors'
import { defineUseCase } from '../define-use-case'
import { linesToAdd, plannedMealsForList } from './list'

export const PreviewMealGroceries = defineUseCase({
  actor: MemberActor,
  input: GrocerySchemas.PreviewInput,
  output: GrocerySchemas.GroceryPreview,
  implementation: async ({ plannedMealIds }, { householdId }) => {
    const [meals, items, listed] = await Promise.all([
      plannedMealsForList(householdId, plannedMealIds),
      listGroceryItems(householdId),
      listListedMeals(householdId)
    ])
    const lines = linesToAdd(meals, listed)
    return { lines: lines.map((line) => ({ ...line, onList: findListedItem(items, line)?.text ?? null })) }
  }
})
