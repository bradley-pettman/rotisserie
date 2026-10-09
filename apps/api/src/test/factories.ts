import { randomUUID } from 'node:crypto'
import type { CookedMealSchemas, PlannedMealSchemas } from '@rotisserie/shared/meals'
import type { RecipeSchemas } from '@rotisserie/shared/recipes'

type UpsertRecipeInput = RecipeSchemas['UpsertRecipeInput']
type PlannedMealInput = PlannedMealSchemas['PlannedMealInput']
type CookedMealInput = CookedMealSchemas['CookedMealInput']

export function recipeInput(overrides: Partial<UpsertRecipeInput> = {}): UpsertRecipeInput {
  return {
    id: randomUUID(),
    name: 'Turkey Sloppy Joes',
    instructions: 'Brown the turkey, add the sauce, simmer.',
    prepTimeMinutes: 10,
    cookTimeMinutes: 20,
    servings: 4,
    sourceUrl: null,
    notes: null,
    ingredients: [
      { name: 'ground turkey', quantity: 1, unit: 'lb', notes: null },
      { name: 'onion', quantity: 1, unit: null, notes: 'diced' }
    ],
    tags: ['weeknight'],
    ...overrides
  }
}

export function plannedMealInput(overrides: Partial<PlannedMealInput> = {}): PlannedMealInput {
  return {
    id: randomUUID(),
    plannedOn: '2026-10-09',
    mealSlot: 'dinner',
    headcount: 4,
    notes: null,
    dishes: [],
    ...overrides
  }
}

export function cookedMealInput(overrides: Partial<CookedMealInput> = {}): CookedMealInput {
  return {
    id: randomUUID(),
    plannedMealId: null,
    cookedOn: '2026-10-09',
    mealSlot: 'dinner',
    headcount: 4,
    notes: null,
    starRating: null,
    dishes: [],
    ...overrides
  }
}
