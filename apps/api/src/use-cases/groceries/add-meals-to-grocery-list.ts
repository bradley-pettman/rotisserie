import { GrocerySchemas, mealLines, planImport } from '@rotisserie/shared/groceries'
import { listGroceryItems, listListedMeals, writeGroceryChanges } from '~/providers/groceries'
import { MemberActor } from '../actors'
import { defineUseCase } from '../define-use-case'
import { linesToAdd, loadGroceryList, mealLabel, plannedMealsForList, withDefaults } from './list'

export const AddMealsToGroceryList = defineUseCase({
  actor: MemberActor,
  input: GrocerySchemas.ImportInput,
  output: GrocerySchemas.GroceryList,
  implementation: async ({ plannedMealIds, excludeKeys }, { householdId }) => {
    const [meals, items, listed] = await Promise.all([
      plannedMealsForList(householdId, plannedMealIds),
      listGroceryItems(householdId),
      listListedMeals(householdId)
    ])
    const excluded = new Set(excludeKeys)
    const lines = linesToAdd(meals, listed).filter((line) => !excluded.has(line.key))
    await writeGroceryChanges(householdId, {
      ...(await withDefaults(householdId, planImport(items, lines))),
      meals: meals.map((meal) => ({ plannedMealId: meal.id, label: mealLabel(meal), lines: mealLines(meal) })),
      removeMealIds: []
    })
    return loadGroceryList(householdId)
  }
})
