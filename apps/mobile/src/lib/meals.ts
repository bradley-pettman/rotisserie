import type { MealSlot } from '@rotisserie/shared/meals'
import { randomUUID } from 'expo-crypto'
import type { CookedMeal, CookedMealInput, PlannedMeal, PlannedMealInput } from '~/api/queries'

export const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack']

export function slotLabel(slot: MealSlot): string {
  return slot.charAt(0).toUpperCase() + slot.slice(1)
}

export function plannedDishName(dish: PlannedMeal['dishes'][number]): string {
  return dish.recipe?.name ?? dish.customText ?? ''
}

export function cookedDishName(dish: CookedMeal['dishes'][number]): string {
  return dish.isLeftovers ? `${dish.label} (leftovers)` : dish.label
}

export function summarize(names: string[]): { lead: string; rest: string } {
  const [lead = 'Nothing yet', ...rest] = names
  return { lead, rest: rest.join(', ') }
}

export type DayEntry =
  | { kind: 'cooked'; slot: MealSlot; meal: CookedMeal }
  | { kind: 'planned'; slot: MealSlot; meal: PlannedMeal }

export function entriesForDay(day: string, planned: PlannedMeal[], cooked: CookedMeal[]): DayEntry[] {
  const cookedToday = cooked.filter((meal) => meal.cookedOn === day)
  const fulfilled = new Set(cooked.map((meal) => meal.plannedMealId).filter((id) => id !== null))
  const entries: DayEntry[] = [
    ...cookedToday.map((meal) => ({ kind: 'cooked' as const, slot: meal.mealSlot, meal })),
    ...planned
      .filter((meal) => meal.plannedOn === day && !fulfilled.has(meal.id))
      .map((meal) => ({ kind: 'planned' as const, slot: meal.mealSlot, meal }))
  ]
  return entries.sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot))
}

export function toPlannedInput(meal: PlannedMeal, changes: Partial<PlannedMealInput> = {}): PlannedMealInput {
  return {
    id: meal.id,
    plannedOn: meal.plannedOn,
    mealSlot: meal.mealSlot,
    headcount: meal.headcount,
    notes: meal.notes,
    dishes: meal.dishes.map((dish) => ({
      id: dish.id,
      recipeId: dish.recipe?.id ?? null,
      customText: dish.recipe ? null : dish.customText,
      notes: dish.notes
    })),
    ...changes
  }
}

export function cookedFromPlan(meal: PlannedMeal, cookedOn: string): CookedMealInput {
  return {
    id: randomUUID(),
    plannedMealId: meal.id,
    cookedOn,
    mealSlot: meal.mealSlot,
    headcount: meal.headcount,
    notes: null,
    starRating: null,
    dishes: meal.dishes.map((dish) => ({
      recipeId: dish.recipe?.id ?? null,
      label: plannedDishName(dish),
      isLeftovers: false,
      notes: dish.notes
    }))
  }
}

export function toCookedInput(meal: CookedMeal, changes: Partial<CookedMealInput> = {}): CookedMealInput {
  return {
    id: meal.id,
    plannedMealId: meal.plannedMealId,
    cookedOn: meal.cookedOn,
    mealSlot: meal.mealSlot,
    headcount: meal.headcount,
    notes: meal.notes,
    starRating: meal.starRating,
    dishes: meal.dishes.map((dish) => ({
      recipeId: dish.recipeId,
      label: dish.label,
      isLeftovers: dish.isLeftovers,
      notes: dish.notes
    })),
    ...changes
  }
}
