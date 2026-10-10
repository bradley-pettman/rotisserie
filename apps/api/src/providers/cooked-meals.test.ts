import { randomUUID } from 'node:crypto'
import { CookedMealSchemas } from '@rotisserie/shared/meals'
import { beforeEach, describe, expect, it } from 'vitest'
import { defaultMember } from '~/test/accounts'
import { cookedMealInput, plannedMealInput, recipeInput } from '~/test/factories'
import {
  deleteCookedMeal,
  getCookedMeal,
  listCookedMeals,
  listCookedMealsWithinDateRange,
  listRecipeStats,
  settlePlannedMealsBefore,
  upsertCookedMealStrict
} from './cooked-meals'
import { getPlannedMeal, listUnscheduledPlannedMeals, upsertPlannedMealStrict } from './planned-meals'
import { deleteRecipe, upsertRecipeStrict } from './recipes'

let householdId: string

beforeEach(() => {
  householdId = defaultMember().householdId
})

describe('upsertCookedMeal', () => {
  it('records what was eaten instead of the plan, leaving the plan untouched', async () => {
    const sloppyJoes = await upsertRecipeStrict(householdId, recipeInput({ name: 'Turkey Sloppy Joes' }))
    const meatloaf = await upsertRecipeStrict(householdId, recipeInput({ name: 'Turkey Meatloaf', servings: 6 }))
    const plan = await upsertPlannedMealStrict(
      householdId,
      plannedMealInput({
        headcount: 4,
        dishes: [
          { id: randomUUID(), recipeId: sloppyJoes.id, customText: null, notes: null },
          { id: randomUUID(), recipeId: null, customText: 'dipping veggies', notes: null }
        ]
      })
    )

    const cooked = await upsertCookedMealStrict(
      householdId,
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
    expect(await getPlannedMeal(householdId, plan.id)).toEqual(plan)
  })

  it('keeps the label from the day after the recipe is renamed or deleted', async () => {
    const recipe = await upsertRecipeStrict(householdId, recipeInput({ name: "Grandma's Lasagne" }))
    const cooked = await upsertCookedMealStrict(
      householdId,
      cookedMealInput({ dishes: [{ recipeId: recipe.id, isLeftovers: false, notes: null }] })
    )

    await upsertRecipeStrict(householdId, recipeInput({ id: recipe.id, name: 'Lasagne' }))
    expect((await getCookedMeal(householdId, cooked.id))?.dishes[0]?.label).toBe("Grandma's Lasagne")

    await deleteRecipe(householdId, recipe.id)
    expect((await getCookedMeal(householdId, cooked.id))?.dishes[0]).toMatchObject({
      recipeId: null,
      label: "Grandma's Lasagne"
    })
  })

  it('prefers an explicit label over the recipe name', async () => {
    const recipe = await upsertRecipeStrict(householdId, recipeInput())

    const cooked = await upsertCookedMealStrict(
      householdId,
      cookedMealInput({ dishes: [{ recipeId: recipe.id, label: 'Joes, extra spicy', isLeftovers: false, notes: null }] })
    )

    expect(cooked.dishes[0]?.label).toBe('Joes, extra spicy')
  })

  it('corrects a logged meal on a second upsert with the same id', async () => {
    const first = await upsertCookedMealStrict(
      householdId,
      cookedMealInput({ dishes: [{ recipeId: null, label: 'tacos', isLeftovers: false, notes: null }] })
    )

    const corrected = await upsertCookedMealStrict(
      householdId,
      cookedMealInput({
        id: first.id,
        cookedOn: '2026-10-08',
        dishes: [{ recipeId: null, label: 'burritos', isLeftovers: false, notes: null }]
      })
    )

    expect(corrected).toMatchObject({ id: first.id, cookedOn: '2026-10-08', dishes: [{ label: 'burritos' }] })
  })

  it('saves a star rating, then changes or clears it on a later upsert', async () => {
    const rated = await upsertCookedMealStrict(householdId, cookedMealInput({ starRating: 5 }))
    expect(rated.starRating).toBe(5)

    const changed = await upsertCookedMealStrict(householdId, cookedMealInput({ id: rated.id, starRating: 2 }))
    expect(changed.starRating).toBe(2)

    const cleared = await upsertCookedMealStrict(householdId, cookedMealInput({ id: rated.id, starRating: null }))
    expect(cleared.starRating).toBeNull()
  })

  it('rejects a star rating outside 1 to 5', async () => {
    const input = cookedMealInput({ starRating: 6 })

    await expect(upsertCookedMealStrict(householdId, input)).rejects.toMatchObject({ code: '23514' })
    expect(await getCookedMeal(householdId, input.id)).toBeNull()
  })

  it('rejects a second cooked meal for the same plan', async () => {
    const plan = await upsertPlannedMealStrict(householdId, plannedMealInput())
    await upsertCookedMealStrict(householdId, cookedMealInput({ plannedMealId: plan.id }))

    await expect(upsertCookedMealStrict(householdId, cookedMealInput({ plannedMealId: plan.id }))).rejects.toMatchObject({
      code: '23505'
    })
  })

  it('rejects a dish with neither a recipe nor a label', async () => {
    const input = cookedMealInput({ dishes: [{ recipeId: null, isLeftovers: false, notes: null }] })

    await expect(upsertCookedMealStrict(householdId, input)).rejects.toMatchObject({ code: '23502' })
    expect(await getCookedMeal(householdId, input.id)).toBeNull()
  })
})

describe('listCookedMealsWithinDateRange', () => {
  it('returns meals in the range, ordered by day then slot', async () => {
    await upsertCookedMealStrict(householdId, cookedMealInput({ cookedOn: '2026-10-09', mealSlot: 'dinner' }))
    await upsertCookedMealStrict(householdId, cookedMealInput({ cookedOn: '2026-10-09', mealSlot: 'breakfast' }))
    await upsertCookedMealStrict(householdId, cookedMealInput({ cookedOn: '2026-10-01', mealSlot: 'dinner' }))

    const meals = await listCookedMealsWithinDateRange(householdId, '2026-10-05', '2026-10-11')

    expect(meals.map((meal) => `${meal.cookedOn} ${meal.mealSlot}`)).toEqual(['2026-10-09 breakfast', '2026-10-09 dinner'])
  })
})

describe('listCookedMeals', () => {
  it('pages newest first without repeating or skipping a meal', async () => {
    await Promise.all(
      ['2026-10-05', '2026-10-06', '2026-10-06', '2026-10-07', '2026-10-08'].map((cookedOn) =>
        upsertCookedMealStrict(householdId, cookedMealInput({ cookedOn, mealSlot: 'snack' }))
      )
    )

    const collectPages = async (cursor?: string): Promise<string[]> => {
      const page = await listCookedMeals(householdId, { limit: 2, cursor })
      const days = page.meals.map((meal) => meal.cookedOn)
      return page.nextCursor === null ? days : [...days, ...(await collectPages(page.nextCursor))]
    }

    expect(await collectPages()).toEqual(['2026-10-08', '2026-10-07', '2026-10-06', '2026-10-06', '2026-10-05'])
  })
})

describe('deleteCookedMeal', () => {
  it('returns the deleted id, then null on a repeat', async () => {
    const cooked = await upsertCookedMealStrict(householdId, cookedMealInput())

    expect(await deleteCookedMeal(householdId, cooked.id)).toEqual({ id: cooked.id })
    expect(await deleteCookedMeal(householdId, cooked.id)).toBeNull()
  })
})

describe('listRecipeStats', () => {
  const made = (recipeId: string) => ({ recipeId, isLeftovers: false, notes: null })
  const leftovers = (recipeId: string) => ({ recipeId, isLeftovers: true, notes: null })

  it('averages ratings to one decimal and counts unrated meals as made but not rated', async () => {
    const meatloaf = await upsertRecipeStrict(householdId, recipeInput({ name: 'Turkey Meatloaf' }))
    await upsertCookedMealStrict(
      householdId,
      cookedMealInput({ cookedOn: '2026-10-01', starRating: 4, dishes: [made(meatloaf.id)] })
    )
    await upsertCookedMealStrict(
      householdId,
      cookedMealInput({ cookedOn: '2026-10-02', starRating: 5, dishes: [made(meatloaf.id)] })
    )
    await upsertCookedMealStrict(
      householdId,
      cookedMealInput({ cookedOn: '2026-10-03', starRating: 5, dishes: [made(meatloaf.id)] })
    )
    await upsertCookedMealStrict(
      householdId,
      cookedMealInput({ cookedOn: '2026-10-04', starRating: null, dishes: [made(meatloaf.id)] })
    )

    expect(await listRecipeStats(householdId, [meatloaf.id])).toEqual([
      { recipeId: meatloaf.id, averageRating: 4.7, ratingCount: 3, timesMade: 4, lastMadeOn: '2026-10-04' }
    ])
  })

  it('ignores leftovers and counts a recipe once per meal', async () => {
    const meatloaf = await upsertRecipeStrict(householdId, recipeInput({ name: 'Turkey Meatloaf' }))
    await upsertCookedMealStrict(
      householdId,
      cookedMealInput({ cookedOn: '2026-10-01', starRating: 2, dishes: [made(meatloaf.id), made(meatloaf.id)] })
    )
    await upsertCookedMealStrict(
      householdId,
      cookedMealInput({ cookedOn: '2026-10-09', mealSlot: 'lunch', starRating: 5, dishes: [leftovers(meatloaf.id)] })
    )

    expect(await listRecipeStats(householdId, [meatloaf.id])).toEqual([
      { recipeId: meatloaf.id, averageRating: 2, ratingCount: 1, timesMade: 1, lastMadeOn: '2026-10-01' }
    ])
  })

  it('answers several recipes in one call, with zeros and nulls for one never made', async () => {
    const meatloaf = await upsertRecipeStrict(householdId, recipeInput({ name: 'Turkey Meatloaf' }))
    const chili = await upsertRecipeStrict(householdId, recipeInput({ name: 'Chili' }))
    const neverMade = await upsertRecipeStrict(householdId, recipeInput({ name: 'Beef Wellington' }))
    await upsertCookedMealStrict(
      householdId,
      cookedMealInput({ cookedOn: '2026-10-05', starRating: 3, dishes: [made(meatloaf.id), made(chili.id)] })
    )
    await upsertCookedMealStrict(householdId, cookedMealInput({ cookedOn: '2026-10-07', dishes: [made(chili.id)] }))

    const result = await listRecipeStats(householdId, [meatloaf.id, chili.id, neverMade.id])

    expect(result).toHaveLength(3)
    expect(result).toEqual(
      expect.arrayContaining([
        { recipeId: meatloaf.id, averageRating: 3, ratingCount: 1, timesMade: 1, lastMadeOn: '2026-10-05' },
        { recipeId: chili.id, averageRating: 3, ratingCount: 1, timesMade: 2, lastMadeOn: '2026-10-07' },
        { recipeId: neverMade.id, averageRating: null, ratingCount: 0, timesMade: 0, lastMadeOn: null }
      ])
    )
  })

  it('returns nothing for no recipes', async () => {
    expect(await listRecipeStats(householdId, [])).toEqual([])
  })
})

describe('settlePlannedMealsBefore', () => {
  const dish = (customText: string) => ({ id: randomUUID(), recipeId: null, customText, notes: null })

  it('logs a past plan as a settled cooked meal, labelling dishes with current names', async () => {
    const chili = await upsertRecipeStrict(householdId, recipeInput({ name: 'Chili' }))
    const plan = await upsertPlannedMealStrict(
      householdId,
      plannedMealInput({
        plannedOn: '2026-10-08',
        headcount: 4,
        dishes: [{ id: randomUUID(), recipeId: chili.id, customText: null, notes: null }, dish('cornbread')]
      })
    )

    const settled = await settlePlannedMealsBefore(householdId, '2026-10-09')

    expect(() => CookedMealSchemas.CookedMeal.array().parse(settled)).not.toThrow()
    expect(settled).toMatchObject([
      {
        plannedMealId: plan.id,
        cookedOn: '2026-10-08',
        mealSlot: 'dinner',
        headcount: 4,
        starRating: null,
        settledOn: '2026-10-09',
        dishes: [
          { recipeId: chili.id, label: 'Chili', sortOrder: 0 },
          { recipeId: null, label: 'cornbread', sortOrder: 1 }
        ]
      }
    ])
  })

  it('leaves today, unscheduled, empty, already cooked and already logged plans alone', async () => {
    await upsertPlannedMealStrict(householdId, plannedMealInput({ plannedOn: '2026-10-09', dishes: [dish('tacos')] }))
    await upsertPlannedMealStrict(householdId, plannedMealInput({ plannedOn: null, dishes: [dish('spaghetti')] }))
    await upsertPlannedMealStrict(householdId, plannedMealInput({ plannedOn: '2026-10-07', dishes: [] }))
    const cooked = await upsertPlannedMealStrict(
      householdId,
      plannedMealInput({ plannedOn: '2026-10-06', dishes: [dish('wings')] })
    )
    await upsertCookedMealStrict(householdId, cookedMealInput({ plannedMealId: cooked.id, cookedOn: '2026-10-06' }))
    await upsertPlannedMealStrict(householdId, plannedMealInput({ plannedOn: '2026-10-05', dishes: [dish('stir fry')] }))
    await upsertCookedMealStrict(householdId, cookedMealInput({ cookedOn: '2026-10-05', dishes: [] }))

    expect(await settlePlannedMealsBefore(householdId, '2026-10-09')).toEqual([])
  })

  it('settles each plan once, and an edit confirms the settled meal', async () => {
    const plan = await upsertPlannedMealStrict(
      householdId,
      plannedMealInput({ plannedOn: '2026-10-08', dishes: [dish('chili')] })
    )
    const [settled] = await settlePlannedMealsBefore(householdId, '2026-10-09')

    expect(await settlePlannedMealsBefore(householdId, '2026-10-10')).toEqual([])

    const confirmed = await upsertCookedMealStrict(
      householdId,
      cookedMealInput({ id: settled?.id, plannedMealId: plan.id, cookedOn: '2026-10-08', starRating: 5 })
    )

    expect(confirmed).toMatchObject({ settledOn: null, starRating: 5 })
  })

  it('does not bring back a plan that was put back in Planned after all', async () => {
    const plan = await upsertPlannedMealStrict(
      householdId,
      plannedMealInput({ plannedOn: '2026-10-08', dishes: [dish('chili')] })
    )
    const [settled] = await settlePlannedMealsBefore(householdId, '2026-10-09')

    await deleteCookedMeal(householdId, settled?.id ?? '')
    await upsertPlannedMealStrict(householdId, plannedMealInput({ id: plan.id, plannedOn: null, dishes: [dish('chili')] }))

    expect(await settlePlannedMealsBefore(householdId, '2026-10-09')).toEqual([])
    expect(await listUnscheduledPlannedMeals(householdId)).toMatchObject([{ id: plan.id }])
  })
})
