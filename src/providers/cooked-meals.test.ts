import { randomUUID } from 'node:crypto'
import { CookedMealSchemas } from '@rotisserie/shared/meals'
import { describe, expect, it } from 'vitest'
import { cookedMealInput, plannedMealInput, recipeInput } from '~/test/factories'
import {
  deleteCookedMeal,
  getCookedMeal,
  lastMade,
  listCookedMeals,
  listCookedMealsWithinDateRange,
  upsertCookedMeal
} from './cooked-meals'
import { getPlannedMeal, upsertPlannedMeal } from './planned-meals'
import { deleteRecipe, upsertRecipe } from './recipes'

describe('upsertCookedMeal', () => {
  it('records what was eaten instead of the plan, leaving the plan untouched', async () => {
    const sloppyJoes = await upsertRecipe(recipeInput({ name: 'Turkey Sloppy Joes' }))
    const meatloaf = await upsertRecipe(recipeInput({ name: 'Turkey Meatloaf', servings: 6 }))
    const plan = await upsertPlannedMeal(
      plannedMealInput({
        headcount: 4,
        dishes: [
          { id: randomUUID(), recipeId: sloppyJoes.id, customText: null, notes: null },
          { id: randomUUID(), recipeId: null, customText: 'dipping veggies', notes: null }
        ]
      })
    )

    const cooked = await upsertCookedMeal(
      cookedMealInput({
        plannedMealId: plan.id,
        headcount: 6,
        notes: 'parents came over',
        dishes: [
          { recipeId: meatloaf.id, isLeftovers: false, notes: null },
          { recipeId: null, label: 'bagged salad', isLeftovers: false, notes: null }
        ]
      })
    )

    expect(() => CookedMealSchemas.CookedMeal.parse(cooked)).not.toThrow()
    expect(cooked).toMatchObject({ plannedMealId: plan.id, cookedOn: '2026-10-09', headcount: 6 })
    expect(cooked.dishes).toMatchObject([
      { recipeId: meatloaf.id, label: 'Turkey Meatloaf', sortOrder: 0 },
      { recipeId: null, label: 'bagged salad', sortOrder: 1 }
    ])
    expect(await getPlannedMeal(plan.id)).toEqual(plan)
  })

  it('keeps the label from the day after the recipe is renamed or deleted', async () => {
    const recipe = await upsertRecipe(recipeInput({ name: "Grandma's Lasagne" }))
    const cooked = await upsertCookedMeal(
      cookedMealInput({ dishes: [{ recipeId: recipe.id, isLeftovers: false, notes: null }] })
    )

    await upsertRecipe(recipeInput({ id: recipe.id, name: 'Lasagne' }))
    expect((await getCookedMeal(cooked.id))?.dishes[0]?.label).toBe("Grandma's Lasagne")

    await deleteRecipe(recipe.id)
    expect((await getCookedMeal(cooked.id))?.dishes[0]).toMatchObject({ recipeId: null, label: "Grandma's Lasagne" })
  })

  it('prefers an explicit label over the recipe name', async () => {
    const recipe = await upsertRecipe(recipeInput())

    const cooked = await upsertCookedMeal(
      cookedMealInput({ dishes: [{ recipeId: recipe.id, label: 'Joes, extra spicy', isLeftovers: false, notes: null }] })
    )

    expect(cooked.dishes[0]?.label).toBe('Joes, extra spicy')
  })

  it('corrects a logged meal on a second upsert with the same id', async () => {
    const first = await upsertCookedMeal(
      cookedMealInput({ dishes: [{ recipeId: null, label: 'tacos', isLeftovers: false, notes: null }] })
    )

    const corrected = await upsertCookedMeal(
      cookedMealInput({
        id: first.id,
        cookedOn: '2026-10-08',
        dishes: [{ recipeId: null, label: 'burritos', isLeftovers: false, notes: null }]
      })
    )

    expect(corrected).toMatchObject({ id: first.id, cookedOn: '2026-10-08', dishes: [{ label: 'burritos' }] })
  })

  it('rejects a second cooked meal for the same plan', async () => {
    const plan = await upsertPlannedMeal(plannedMealInput())
    await upsertCookedMeal(cookedMealInput({ plannedMealId: plan.id }))

    await expect(upsertCookedMeal(cookedMealInput({ plannedMealId: plan.id }))).rejects.toMatchObject({ code: '23505' })
  })

  it('rejects a dish with neither a recipe nor a label', async () => {
    const input = cookedMealInput({ dishes: [{ recipeId: null, isLeftovers: false, notes: null }] })

    await expect(upsertCookedMeal(input)).rejects.toMatchObject({ code: '23502' })
    expect(await getCookedMeal(input.id)).toBeNull()
  })
})

describe('listCookedMealsWithinDateRange', () => {
  it('returns meals in the range, ordered by day then slot', async () => {
    await upsertCookedMeal(cookedMealInput({ cookedOn: '2026-10-09', mealSlot: 'dinner' }))
    await upsertCookedMeal(cookedMealInput({ cookedOn: '2026-10-09', mealSlot: 'breakfast' }))
    await upsertCookedMeal(cookedMealInput({ cookedOn: '2026-10-01', mealSlot: 'dinner' }))

    const meals = await listCookedMealsWithinDateRange('2026-10-05', '2026-10-11')

    expect(meals.map((meal) => `${meal.cookedOn} ${meal.mealSlot}`)).toEqual(['2026-10-09 breakfast', '2026-10-09 dinner'])
  })
})

describe('listCookedMeals', () => {
  it('pages newest first without repeating or skipping a meal', async () => {
    await Promise.all(
      ['2026-10-05', '2026-10-06', '2026-10-06', '2026-10-07', '2026-10-08'].map((cookedOn) =>
        upsertCookedMeal(cookedMealInput({ cookedOn, mealSlot: 'snack' }))
      )
    )

    const collectPages = async (cursor?: string): Promise<string[]> => {
      const page = await listCookedMeals({ limit: 2, cursor })
      const days = page.meals.map((meal) => meal.cookedOn)
      return page.nextCursor === null ? days : [...days, ...(await collectPages(page.nextCursor))]
    }

    expect(await collectPages()).toEqual(['2026-10-08', '2026-10-07', '2026-10-06', '2026-10-06', '2026-10-05'])
  })
})

describe('deleteCookedMeal', () => {
  it('reports whether a meal was deleted', async () => {
    const cooked = await upsertCookedMeal(cookedMealInput())

    expect(await deleteCookedMeal(cooked.id)).toBe(true)
    expect(await deleteCookedMeal(cooked.id)).toBe(false)
  })
})

describe('lastMade', () => {
  it('returns the latest day each recipe was freshly made, ignoring leftovers', async () => {
    const meatloaf = await upsertRecipe(recipeInput({ name: 'Turkey Meatloaf' }))
    const neverMade = await upsertRecipe(recipeInput({ name: 'Beef Wellington' }))
    await upsertCookedMeal(
      cookedMealInput({ cookedOn: '2026-10-01', dishes: [{ recipeId: meatloaf.id, isLeftovers: false, notes: null }] })
    )
    await upsertCookedMeal(
      cookedMealInput({ cookedOn: '2026-10-09', dishes: [{ recipeId: meatloaf.id, isLeftovers: false, notes: null }] })
    )
    await upsertCookedMeal(
      cookedMealInput({
        cookedOn: '2026-10-10',
        mealSlot: 'lunch',
        dishes: [{ recipeId: meatloaf.id, isLeftovers: true, notes: null }]
      })
    )

    const result = await lastMade([meatloaf.id, neverMade.id])

    expect(result).toEqual([{ recipeId: meatloaf.id, cookedOn: '2026-10-09' }])
  })

  it('returns nothing for no recipes', async () => {
    expect(await lastMade([])).toEqual([])
  })
})
