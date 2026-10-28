import { describe, expect, it, vi } from 'vitest'
import type { CookedMeal, PlannedMeal } from '~/api/queries'
import { entriesForDay, replacedPlan } from './meals'

vi.mock('expo-crypto', () => ({ randomUUID: () => 'generated-id' }))

type PlannedDish = PlannedMeal['dishes'][number]

function recipe(id: string, name: string): PlannedDish['recipe'] {
  return { id, name } as PlannedDish['recipe']
}

function plan(id: string, dishes: { recipe?: PlannedDish['recipe']; customText?: string }[]): PlannedMeal {
  return {
    id,
    plannedOn: '2026-10-26',
    mealSlot: 'dinner',
    headcount: 4,
    notes: null,
    createdAt: '2026-10-20T12:00:00.000Z',
    updatedAt: '2026-10-20T12:00:00.000Z',
    dishes: dishes.map((dish, index) => ({
      id: `${id}-dish-${index}`,
      recipe: dish.recipe ?? null,
      customText: dish.customText ?? null,
      notes: null,
      sortOrder: index
    }))
  }
}

function cooked(plannedMealId: string | null, dishes: { recipeId?: string; label: string }[]): CookedMeal {
  return {
    id: 'cooked-1',
    plannedMealId,
    cookedOn: '2026-10-26',
    mealSlot: 'dinner',
    headcount: 4,
    notes: null,
    starRating: null,
    settledOn: null,
    createdAt: '2026-10-26T20:00:00.000Z',
    dishes: dishes.map((dish, index) => ({
      id: `cooked-dish-${index}`,
      recipeId: dish.recipeId ?? null,
      label: dish.label,
      isLeftovers: false,
      notes: null,
      sortOrder: index
    }))
  }
}

describe('replacedPlan', () => {
  const sloppyJoes = plan('plan-1', [{ recipe: recipe('recipe-1', 'Sloppy joes') }, { customText: 'Chips' }])

  it('is null when no plan is linked', () => {
    expect(replacedPlan(cooked(null, [{ label: 'Meatloaf' }]), [sloppyJoes])).toBeNull()
  })

  it('is null when the linked plan is not loaded', () => {
    expect(replacedPlan(cooked('plan-2', [{ label: 'Meatloaf' }]), [sloppyJoes])).toBeNull()
  })

  it('is null when a planned recipe was eaten', () => {
    const meal = cooked('plan-1', [{ recipeId: 'recipe-1', label: 'Sloppy joes' }])
    expect(replacedPlan(meal, [sloppyJoes])).toBeNull()
  })

  it('is null when a planned dish was eaten, matching its name loosely', () => {
    expect(replacedPlan(cooked('plan-1', [{ label: ' chips ' }]), [sloppyJoes])).toBeNull()
  })

  it('returns the plan when nothing planned was eaten', () => {
    const meal = cooked('plan-1', [{ recipeId: 'recipe-2', label: 'Meatloaf' }])
    expect(replacedPlan(meal, [sloppyJoes])).toBe(sloppyJoes)
  })

  it('compares recipes by id, not by a renamed label', () => {
    const meal = cooked('plan-1', [{ recipeId: 'recipe-2', label: 'Sloppy joes' }])
    expect(replacedPlan(meal, [sloppyJoes])).toBe(sloppyJoes)
  })
})

describe('entriesForDay', () => {
  it('attaches the replaced plan to the eaten meal and hides the plan', () => {
    const sloppyJoes = plan('plan-1', [{ customText: 'Sloppy joes' }])
    const meal = cooked('plan-1', [{ label: 'Meatloaf' }])
    expect(entriesForDay('2026-10-26', [sloppyJoes], [meal])).toEqual([
      { kind: 'cooked', slot: 'dinner', meal, instead: sloppyJoes }
    ])
  })
})
