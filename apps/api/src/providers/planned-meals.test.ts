import { randomUUID } from 'node:crypto'
import { PlannedMealSchemas } from '@rotisserie/shared/meals'
import { beforeEach, describe, expect, it } from 'vitest'
import { defaultMember } from '~/test/accounts'
import { plannedMealInput, recipeInput } from '~/test/factories'
import { upsertCookedMealStrict, getCookedMeal } from './cooked-meals'
import {
  addPlannedDish,
  deletePlannedMeal,
  getPlannedMeal,
  listPlannedMealsWithinDateRange,
  listUnscheduledPlannedMeals,
  removePlannedDish,
  upsertPlannedMealStrict
} from './planned-meals'
import { deleteRecipe, upsertRecipeStrict } from './recipes'
import { cookedMealInput } from '~/test/factories'

let householdId: string

beforeEach(() => {
  householdId = defaultMember().householdId
})

describe('upsertPlannedMeal', () => {
  it('plans a meal with a recipe dish and a free-text dish', async () => {
    const sloppyJoes = await upsertRecipeStrict(householdId, recipeInput())

    const meal = await upsertPlannedMealStrict(
      householdId,
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
    const original = await upsertPlannedMealStrict(
      householdId,
      plannedMealInput({ dishes: [{ id: randomUUID(), recipeId: null, customText: 'tacos', notes: null }] })
    )

    const moved = await upsertPlannedMealStrict(
      householdId,
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
    await upsertPlannedMealStrict(householdId, plannedMealInput())

    await expect(upsertPlannedMealStrict(householdId, plannedMealInput())).rejects.toMatchObject({ code: '23505' })
  })

  it('plans several meals for the same slot without a date', async () => {
    await upsertPlannedMealStrict(householdId, plannedMealInput({ plannedOn: null }))
    const second = await upsertPlannedMealStrict(householdId, plannedMealInput({ plannedOn: null }))

    expect(second).toMatchObject({ plannedOn: null, mealSlot: 'dinner' })
  })

  it('rejects a dish that names nothing', async () => {
    const input = plannedMealInput({ dishes: [{ id: randomUUID(), recipeId: null, customText: null, notes: null }] })

    await expect(upsertPlannedMealStrict(householdId, input)).rejects.toMatchObject({ code: '23514' })
    expect(await getPlannedMeal(householdId, input.id)).toBeNull()
  })

  it('reads a recipe under its current name', async () => {
    const recipe = await upsertRecipeStrict(householdId, recipeInput())
    const meal = await upsertPlannedMealStrict(
      householdId,
      plannedMealInput({ dishes: [{ id: randomUUID(), recipeId: recipe.id, customText: null, notes: null }] })
    )

    await upsertRecipeStrict(householdId, recipeInput({ id: recipe.id, name: 'Sloppy Joes, Turkey' }))

    expect((await getPlannedMeal(householdId, meal.id))?.dishes[0]?.recipe?.name).toBe('Sloppy Joes, Turkey')
  })
})

describe('listPlannedMealsWithinDateRange', () => {
  it('returns meals in the range, ordered by day then slot', async () => {
    await upsertPlannedMealStrict(householdId, plannedMealInput({ plannedOn: '2026-10-10', mealSlot: 'breakfast' }))
    await upsertPlannedMealStrict(householdId, plannedMealInput({ plannedOn: '2026-10-09', mealSlot: 'dinner' }))
    await upsertPlannedMealStrict(householdId, plannedMealInput({ plannedOn: '2026-10-09', mealSlot: 'lunch' }))
    await upsertPlannedMealStrict(householdId, plannedMealInput({ plannedOn: '2026-10-12', mealSlot: 'dinner' }))

    const meals = await listPlannedMealsWithinDateRange(householdId, '2026-10-09', '2026-10-11')

    expect(meals.map((meal) => `${meal.plannedOn} ${meal.mealSlot}`)).toEqual([
      '2026-10-09 lunch',
      '2026-10-09 dinner',
      '2026-10-10 breakfast'
    ])
  })
})

describe('listUnscheduledPlannedMeals', () => {
  it('returns meals with no date that have not been cooked, oldest first', async () => {
    const spaghetti = await upsertPlannedMealStrict(
      householdId,
      plannedMealInput({
        plannedOn: null,
        dishes: [{ id: randomUUID(), recipeId: null, customText: 'spaghetti', notes: null }]
      })
    )
    const tacos = await upsertPlannedMealStrict(
      householdId,
      plannedMealInput({ plannedOn: null, dishes: [{ id: randomUUID(), recipeId: null, customText: 'tacos', notes: null }] })
    )
    const chili = await upsertPlannedMealStrict(
      householdId,
      plannedMealInput({ plannedOn: null, dishes: [{ id: randomUUID(), recipeId: null, customText: 'chili', notes: null }] })
    )
    await upsertPlannedMealStrict(householdId, plannedMealInput({ plannedOn: '2026-10-12' }))
    await upsertCookedMealStrict(householdId, cookedMealInput({ plannedMealId: tacos.id }))

    expect((await listUnscheduledPlannedMeals(householdId)).map((meal) => meal.id)).toEqual([spaghetti.id, chili.id])
  })

  it('drops a meal once it is scheduled and takes it back when unscheduled', async () => {
    const chili = await upsertPlannedMealStrict(householdId, plannedMealInput({ plannedOn: null }))

    await upsertPlannedMealStrict(householdId, plannedMealInput({ id: chili.id, plannedOn: '2026-10-12' }))
    expect(await listUnscheduledPlannedMeals(householdId)).toEqual([])
    expect(await listPlannedMealsWithinDateRange(householdId, '2026-10-12', '2026-10-12')).toMatchObject([{ id: chili.id }])

    await upsertPlannedMealStrict(householdId, plannedMealInput({ id: chili.id, plannedOn: null }))
    expect(await listUnscheduledPlannedMeals(householdId)).toMatchObject([{ id: chili.id }])
  })
})

describe('addPlannedDish and removePlannedDish', () => {
  it('appends a dish to the end and removes it again', async () => {
    const meal = await upsertPlannedMealStrict(
      householdId,
      plannedMealInput({ dishes: [{ id: randomUUID(), recipeId: null, customText: 'burgers', notes: null }] })
    )
    const saladId = randomUUID()

    const withSalad = await addPlannedDish(householdId, meal.id, {
      id: saladId,
      recipeId: null,
      customText: 'salad',
      notes: null
    })

    expect(withSalad?.dishes.map((dish) => [dish.customText, dish.sortOrder])).toEqual([
      ['burgers', 0],
      ['salad', 1]
    ])

    const withoutSalad = await removePlannedDish(householdId, saladId)

    expect(withoutSalad?.dishes.map((dish) => dish.customText)).toEqual(['burgers'])
  })

  it('returns null for an unknown meal or dish', async () => {
    expect(
      await addPlannedDish(householdId, randomUUID(), { id: randomUUID(), recipeId: null, customText: 'x', notes: null })
    ).toBeNull()
    expect(await removePlannedDish(householdId, randomUUID())).toBeNull()
  })
})

describe('deleting', () => {
  it('drops a planned dish when its recipe is deleted', async () => {
    const recipe = await upsertRecipeStrict(householdId, recipeInput())
    const meal = await upsertPlannedMealStrict(
      householdId,
      plannedMealInput({
        dishes: [
          { id: randomUUID(), recipeId: recipe.id, customText: null, notes: null },
          { id: randomUUID(), recipeId: null, customText: 'dipping veggies', notes: null }
        ]
      })
    )

    await deleteRecipe(householdId, recipe.id)

    expect((await getPlannedMeal(householdId, meal.id))?.dishes.map((dish) => dish.customText)).toEqual(['dipping veggies'])
  })

  it('keeps the cooked meal when the plan it fulfilled is deleted', async () => {
    const plan = await upsertPlannedMealStrict(householdId, plannedMealInput())
    const cooked = await upsertCookedMealStrict(
      householdId,
      cookedMealInput({
        plannedMealId: plan.id,
        dishes: [{ recipeId: null, label: 'bagged salad', isLeftovers: false, notes: null }]
      })
    )

    expect(await deletePlannedMeal(householdId, plan.id)).toEqual({ id: plan.id })
    expect(await deletePlannedMeal(householdId, plan.id)).toBeNull()
    expect(await getCookedMeal(householdId, cooked.id)).toMatchObject({
      plannedMealId: null,
      dishes: [{ label: 'bagged salad' }]
    })
  })
})
