import { GrocerySchemas, mealLines, planImport } from '@rotisserie/shared/groceries'
import z from 'zod'
import { getListedMealStrict, listGroceryItems, listPlannedMealsForList, writeGroceryChanges } from '~/providers/groceries'
import { MemberActor } from '../actors'
import { defineUseCase } from '../define-use-case'
import { alertFor, loadGroceryList, mealLabel, withDefaults } from './list'

export const ResolveGroceryAlert = defineUseCase({
  actor: MemberActor,
  input: z.object({ id: z.uuid(), addNew: z.boolean() }),
  output: GrocerySchemas.GroceryList,
  implementation: async ({ id, addNew }, { householdId }) => {
    const listed = await getListedMealStrict(householdId, id)
    const [meal] = listed.plannedMealId === null ? [] : await listPlannedMealsForList(householdId, [listed.plannedMealId])
    const alert = alertFor(listed, meal)
    const items = addNew && alert !== null ? await listGroceryItems(householdId) : []
    const plan = addNew && alert !== null ? planImport(items, alert.increase) : { updates: [], inserts: [] }
    const keep = meal !== undefined && listed.plannedMealId !== null
    await writeGroceryChanges(householdId, {
      ...(await withDefaults(householdId, plan)),
      meals: keep ? [{ plannedMealId: meal.id, label: mealLabel(meal), lines: mealLines(meal) }] : [],
      removeMealIds: keep ? [] : [listed.id]
    })
    return loadGroceryList(householdId)
  }
})
