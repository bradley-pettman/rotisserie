import type { CookedMealSchemas, MealSlot } from '@rotisserie/shared/meals'

export type CookedDishInput = {
  recipeId: string | null
  label?: string
  isLeftovers: boolean
  notes: string | null
}

export type CookedMealInput = {
  plannedMealId: string | null
  cookedOn: string
  mealSlot: MealSlot
  headcount: number | null
  notes: string | null
  dishes: CookedDishInput[]
}

export type CookedMealPage = {
  meals: CookedMealSchemas['CookedMeal'][]
  nextBefore: string | null
}

export async function logCookedMeal(input: CookedMealInput): Promise<CookedMealSchemas['CookedMeal']> {
  throw new Error('Not implemented: logCookedMeal')
}

export async function getCookedMeal(id: string): Promise<CookedMealSchemas['CookedMeal'] | null> {
  throw new Error('Not implemented: getCookedMeal')
}

export async function getCookedMeals(from: string, to: string): Promise<CookedMealSchemas['CookedMeal'][]> {
  throw new Error('Not implemented: getCookedMeals')
}

export async function listCookedMeals(options: { before?: string; limit: number }): Promise<CookedMealPage> {
  throw new Error('Not implemented: listCookedMeals')
}

export async function updateCookedMeal(
  id: string,
  patch: Partial<CookedMealInput>
): Promise<CookedMealSchemas['CookedMeal'] | null> {
  throw new Error('Not implemented: updateCookedMeal')
}

export async function deleteCookedMeal(id: string): Promise<boolean> {
  throw new Error('Not implemented: deleteCookedMeal')
}

export async function lastMade(recipeIds: string[]): Promise<Map<string, string>> {
  throw new Error('Not implemented: lastMade')
}
