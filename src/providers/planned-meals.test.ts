import { randomUUID } from 'node:crypto'
import { PlannedMealSchemas } from '@rotisserie/shared/meals'
import { describe, expect, it } from 'vitest'
import { plannedMealInput, recipeInput } from '~/test/factories'
import { upsertCookedMeal, getCookedMeal } from './cooked-meals'
import {
  addPlannedDish,
  deletePlannedMeal,
  getPlannedMeal,
  listPlannedMealsWithinDateRange,
  removePlannedDish,
  upsertPlannedMeal
} from './planned-meals'
import { deleteRecipe, upsertRecipe } from './recipes'
import { cookedMealInput } from '~/test/factories'

describe('upsertPlannedMeal', () => {
  it('plans a meal with a recipe dish and a free-text dish', async () => {
    const sloppyJoes = await upsertRecipe(recipeInput())

    const meal = await upsertPlannedMeal(
      plannedMealInput({
        headcount: 4,
        dishes: [
          { id: randomUUID(), recipeId: sloppyJoes.id, customText: null, notes: null },
          { id: randomUUID(), recipeId: null, customText: 'dipping veggies', notes: null }
        ]
      })
    )

    expect(() => PlannedMealSchemas.PlannedMeal.parse(meal)).not.toThrow()
    expect(meal).toMatchObject({ plannedOn: '2026-10-09', mealSlot: 'dinner', headcount: 4 })
    expect(meal.dishes).toMatchObject([
      { recipe: { id: sloppyJoes.id, name: 'Turkey Sloppy Joes' }, customText: null, sortOrder: 0 },
      { recipe: null, customText: 'dipping veggies', sortOrder: 1 }
    ])
  })

  it('moves a meal and replaces its dishes on a second upsert with the same id', async () => {
    const original = await upsertPlannedMeal(
      plannedMealInput({ dishes: [{ id: randomUUID(), recipeId: null, customText: 'tacos', notes: null }] })
    )

    const moved = await upsertPlannedMeal(
      plannedMealInput({
        id: original.id,
        plannedOn: '2026-10-10',
        dishes: [{ id: randomUUID(), recipeId: null, customText: 'pizza night', notes: null }]
      })
    )

    expect(moved.plannedOn).toBe('2026-10-10')
    expect(moved.dishes.map((dish) => dish.customText)).toEqual(['pizza night'])
    expect(moved.createdAt).toBe(original.createdAt)
  })

  it('rejects a second meal in the same date and slot', async () => {
    await upsertPlannedMeal(plannedMealInput())

    await expect(upsertPlannedMeal(plannedMealInput())).rejects.toMatchObject({ code: '23505' })
  })

  it('rejects a dish that names nothing', async () => {
    const input = plannedMealInput({ dishes: [{ id: randomUUID(), recipeId: null, customText: null, notes: null }] })

    await expect(upsertPlannedMeal(input)).rejects.toMatchObject({ code: '23514' })
    expect(await getPlannedMeal(input.id)).toBeNull()
  })

  it('reads a recipe under its current name', async () => {
    const recipe = await upsertRecipe(recipeInput())
    const meal = await upsertPlannedMeal(
      plannedMealInput({ dishes: [{ id: randomUUID(), recipeId: recipe.id, customText: null, notes: null }] })
    )

    await upsertRecipe(recipeInput({ id: recipe.id, name: 'Sloppy Joes, Turkey' }))

    expect((await getPlannedMeal(meal.id))?.dishes[0]?.recipe?.name).toBe('Sloppy Joes, Turkey')
  })
})

describe('listPlannedMealsWithinDateRange', () => {
  it('returns meals in the range, ordered by day then slot', async () => {
    await upsertPlannedMeal(plannedMealInput({ plannedOn: '2026-10-10', mealSlot: 'breakfast' }))
    await upsertPlannedMeal(plannedMealInput({ plannedOn: '2026-10-09', mealSlot: 'dinner' }))
    await upsertPlannedMeal(plannedMealInput({ plannedOn: '2026-10-09', mealSlot: 'lunch' }))
    await upsertPlannedMeal(plannedMealInput({ plannedOn: '2026-10-12', mealSlot: 'dinner' }))

    const meals = await listPlannedMealsWithinDateRange('2026-10-09', '2026-10-11')

    expect(meals.map((meal) => `${meal.plannedOn} ${meal.mealSlot}`)).toEqual([
      '2026-10-09 lunch',
      '2026-10-09 dinner',
      '2026-10-10 breakfast'
    ])
  })
})

describe('addPlannedDish and removePlannedDish', () => {
  it('appends a dish to the end and removes it again', async () => {
    const meal = await upsertPlannedMeal(
      plannedMealInput({ dishes: [{ id: randomUUID(), recipeId: null, customText: 'burgers', notes: null }] })
    )
    const saladId = randomUUID()

    const withSalad = await addPlannedDish(meal.id, { id: saladId, recipeId: null, customText: 'salad', notes: null })

    expect(withSalad?.dishes.map((dish) => [dish.customText, dish.sortOrder])).toEqual([
      ['burgers', 0],
      ['salad', 1]
    ])

    const withoutSalad = await removePlannedDish(saladId)

    expect(withoutSalad?.dishes.map((dish) => dish.customText)).toEqual(['burgers'])
  })

  it('returns null for an unknown meal or dish', async () => {
    expect(await addPlannedDish(randomUUID(), { id: randomUUID(), recipeId: null, customText: 'x', notes: null })).toBeNull()
    expect(await removePlannedDish(randomUUID())).toBeNull()
  })
})

describe('deleting', () => {
  it('drops a planned dish when its recipe is deleted', async () => {
    const recipe = await upsertRecipe(recipeInput())
    const meal = await upsertPlannedMeal(
      plannedMealInput({
        dishes: [
          { id: randomUUID(), recipeId: recipe.id, customText: null, notes: null },
          { id: randomUUID(), recipeId: null, customText: 'dipping veggies', notes: null }
        ]
      })
    )

    await deleteRecipe(recipe.id)

    expect((await getPlannedMeal(meal.id))?.dishes.map((dish) => dish.customText)).toEqual(['dipping veggies'])
  })

  it('keeps the cooked meal when the plan it fulfilled is deleted', async () => {
    const plan = await upsertPlannedMeal(plannedMealInput())
    const cooked = await upsertCookedMeal(
      cookedMealInput({
        plannedMealId: plan.id,
        dishes: [{ recipeId: null, label: 'bagged salad', isLeftovers: false, notes: null }]
      })
    )

    expect(await deletePlannedMeal(plan.id)).toEqual({ id: plan.id })
    expect(await deletePlannedMeal(plan.id)).toBeNull()
    expect(await getCookedMeal(cooked.id)).toMatchObject({ plannedMealId: null, dishes: [{ label: 'bagged salad' }] })
  })
})
