import {
  defaultsFor,
  diffLines,
  groceryNameKeys,
  hasChanges,
  mealLines,
  mergeLines,
  type GrocerySchemas,
  type GrocerySection,
  type ImportPlan
} from '@rotisserie/shared/groceries'
import { uniq } from 'lodash-es'
import { NotFoundError } from '~/providers/errors'
import {
  listGroceryDefaults,
  listGroceryItems,
  listGroceryStores,
  listIngredientSections,
  listListedMeals,
  listPlannedMealsForList,
  type GroceryChanges,
  type ListedMeal,
  type PlannedMealForList
} from '~/providers/groceries'

export async function resolveDefaults(
  householdId: string,
  names: string[]
): Promise<{ storeId: string | null; section: GrocerySection | null }[]> {
  const keys = names.map(groceryNameKeys)
  const all = uniq(keys.flat())
  const [defaults, ingredients] = await Promise.all([listGroceryDefaults(householdId, all), listIngredientSections(all)])
  return keys.map((candidates) => defaultsFor(candidates, defaults, ingredients))
}

export async function withDefaults(
  householdId: string,
  plan: ImportPlan
): Promise<Pick<GroceryChanges, 'updates' | 'inserts'>> {
  const resolved = await resolveDefaults(
    householdId,
    plan.inserts.map((insert) => insert.line.name)
  )
  return {
    updates: plan.updates,
    inserts: plan.inserts.map((insert, index) => ({ ...insert, storeId: null, section: null, ...resolved[index] }))
  }
}

export function mealLabel(meal: PlannedMealForList): string {
  const names = meal.dishes.map((dish) => dish.name).filter((name) => name.trim() !== '')
  const label = names.length > 0 ? names.join(', ') : meal.mealSlot.charAt(0).toUpperCase() + meal.mealSlot.slice(1)
  return label.length > 255 ? `${label.slice(0, 254)}…` : label
}

export async function plannedMealsForList(householdId: string, ids: string[]): Promise<PlannedMealForList[]> {
  const wanted = uniq(ids)
  const meals = await listPlannedMealsForList(householdId, wanted)
  if (meals.length !== wanted.length) throw new NotFoundError('Planned meal not found')
  return meals
}

export function linesToAdd(meals: PlannedMealForList[], listed: ListedMeal[]): GrocerySchemas['GroceryLine'][] {
  const earlier = new Map(listed.flatMap((entry) => (entry.plannedMealId === null ? [] : [[entry.plannedMealId, entry]])))
  return mergeLines(
    meals.flatMap((meal) => {
      const lines = mealLines(meal)
      const previous = earlier.get(meal.id)
      return previous === undefined ? lines : diffLines(previous.lines, lines).increase
    })
  )
}

export function alertFor(listed: ListedMeal, meal: PlannedMealForList | undefined): GrocerySchemas['GroceryAlert'] | null {
  if (listed.plannedMealId === null || meal === undefined) {
    return {
      id: listed.id,
      plannedMealId: null,
      label: listed.label,
      kind: 'removed',
      added: [],
      removed: listed.lines,
      changed: [],
      increase: []
    }
  }
  if (meal.cooked) return null
  const diff = diffLines(listed.lines, mealLines(meal))
  if (!hasChanges(diff)) return null
  return { id: listed.id, plannedMealId: meal.id, label: mealLabel(meal), kind: 'changed', ...diff }
}

export async function loadGroceryList(householdId: string): Promise<GrocerySchemas['GroceryList']> {
  const [items, listed, stores] = await Promise.all([
    listGroceryItems(householdId),
    listListedMeals(householdId),
    listGroceryStores(householdId)
  ])
  const meals = await listPlannedMealsForList(
    householdId,
    listed.flatMap((entry) => (entry.plannedMealId === null ? [] : [entry.plannedMealId]))
  )
  const byId = new Map(meals.map((meal) => [meal.id, meal]))
  return {
    items,
    stores,
    alerts: listed.flatMap((entry) => {
      const alert = alertFor(entry, entry.plannedMealId === null ? undefined : byId.get(entry.plannedMealId))
      return alert === null ? [] : [alert]
    }),
    meals: listed.flatMap((entry) => {
      const meal = entry.plannedMealId === null ? undefined : byId.get(entry.plannedMealId)
      return meal === undefined ? [] : [{ plannedMealId: meal.id, label: mealLabel(meal), addedAt: entry.addedAt }]
    })
  }
}
