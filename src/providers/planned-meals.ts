import type { MealSlot, PlannedMealSchemas } from '@rotisserie/shared/meals'

export type PlannedDishInput = {
  id: string
  recipeId: string | null
  customText: string | null
  notes: string | null
}

export type PlannedMealInput = {
  plannedOn: string
  mealSlot: MealSlot
  headcount: number | null
  notes: string | null
  dishes: PlannedDishInput[]
}

export async function listPlannedMealsWithinDateRange(
  plannedFrom: string,
  plannedTo: string
): Promise<PlannedMealSchemas['PlannedMeal'][]> {
  throw new Error('Not implemented: getPlannedMeals')
}

export async function getPlannedMeal(id: string): Promise<PlannedMealSchemas['PlannedMeal'] | null> {
  throw new Error('Not implemented: getPlannedMeal')
}

export async function upsertPlannedMeal(input: PlannedMealInput): Promise<PlannedMealSchemas['PlannedMeal']> {
  throw new Error('Not implemented: upsertPlannedMeal')
}

export async function deletePlannedMeal(id: string): Promise<boolean> {
  throw new Error('Not implemented: deletePlannedMeal')
}

export async function addPlannedDish(
  plannedMealId: string,
  dish: PlannedDishInput
): Promise<PlannedMealSchemas['PlannedMeal'] | null> {
  throw new Error('Not implemented: addPlannedDish')
}

export async function removePlannedDish(dishId: string): Promise<PlannedMealSchemas['PlannedMeal'] | null> {
  throw new Error('Not implemented: removePlannedDish')
}
