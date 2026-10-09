import { randomUUID } from 'node:crypto'
import type { CookedMealInput } from '~/providers/cooked-meals'
import type { PlannedMealInput } from '~/providers/planned-meals'
import type { UpsertRecipeInput } from '~/providers/recipes'

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
    dishes: [],
    ...overrides
  }
}
