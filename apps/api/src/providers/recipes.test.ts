import { randomUUID } from 'node:crypto'
import { RecipeSchemas } from '@rotisserie/shared/recipes'
import { sortBy } from 'lodash-es'
import { beforeEach, describe, expect, it } from 'vitest'
import { defaultMember } from '~/test/accounts'
import { DB } from '~/db/connection'
import { cookedMealInput, recipeInput } from '~/test/factories'
import { upsertCookedMealStrict } from './cooked-meals'
import { getRecipe, deleteRecipe, listRecipes, upsertRecipeStrict } from './recipes'
import { InvalidCursorError } from './sql'

type RecipeSort = RecipeSchemas['RecipeSort']

let householdId: string

beforeEach(() => {
  householdId = defaultMember().householdId
})

describe('upsertRecipe', () => {
  it('creates a recipe whose shape matches the shared schema', async () => {
    const input = recipeInput({
      ingredients: [
        { name: 'Ground Turkey', quantity: 1.5, unit: 'lbs', notes: null },
        { name: 'onion', quantity: 1, unit: null, notes: 'diced' }
      ],
      tags: ['Weeknight', 'turkey']
    })

    const recipe = await upsertRecipeStrict(householdId, input)

    expect(() => RecipeSchemas.Recipe.parse(recipe)).not.toThrow()
    expect(recipe).toMatchObject({ id: input.id, name: 'Turkey Sloppy Joes', servings: 4 })
    expect(recipe.ingredients).toMatchObject([
      { ingredient: { name: 'ground turkey' }, quantity: 1.5, unit: { name: 'pound' }, sortOrder: 0 },
      { ingredient: { name: 'onion' }, quantity: 1, unit: null, notes: 'diced', sortOrder: 1 }
    ])
    expect(recipe.tags.map((tag) => tag.name)).toEqual(['turkey', 'weeknight'])
  })

  it('replaces the recipe, its lines and its tags on a second upsert with the same id', async () => {
    const first = await upsertRecipeStrict(householdId, recipeInput())

    const second = await upsertRecipeStrict(
      householdId,
      recipeInput({
        id: first.id,
        name: 'Turkey Sloppy Joes (double batch)',
        ingredients: [{ name: 'ground turkey', quantity: 2, unit: 'lb', notes: null }],
        tags: []
      })
    )

    expect(second.name).toBe('Turkey Sloppy Joes (double batch)')
    expect(second.ingredients).toHaveLength(1)
    expect(second.ingredients[0]?.quantity).toBe(2)
    expect(second.tags).toEqual([])
    expect(second.createdAt).toBe(first.createdAt)
    expect(second.updatedAt > first.updatedAt).toBe(true)
    expect((await listRecipes(householdId, { sort: 'name', limit: 10 })).recipes).toHaveLength(1)
  })

  it('allows the same ingredient on two lines', async () => {
    const recipe = await upsertRecipeStrict(
      householdId,
      recipeInput({
        ingredients: [
          { name: 'flour', quantity: 2, unit: 'cups', notes: 'divided' },
          { name: 'Flour', quantity: 1, unit: 'tbsp', notes: 'for dusting' }
        ]
      })
    )

    expect(recipe.ingredients.map((line) => line.ingredient.id)).toEqual([
      recipe.ingredients[0]?.ingredient.id,
      recipe.ingredients[0]?.ingredient.id
    ])
  })

  it('rolls back the whole save when a line is invalid', async () => {
    const input = recipeInput({ ingredients: [{ name: 'salt', quantity: -1, unit: null, notes: null }] })

    await expect(upsertRecipeStrict(householdId, input)).rejects.toMatchObject({ code: '23514' })
    expect(await getRecipe(householdId, input.id)).toBeNull()
  })
})

describe('getRecipe', () => {
  it('returns null for an unknown id', async () => {
    expect(await getRecipe(householdId, randomUUID())).toBeNull()
  })
})

describe('listRecipes', () => {
  const made = (recipeId: string) => ({ recipeId, isLeftovers: false, notes: null })

  async function cook(recipeId: string, cookedOn: string, starRating: number | null) {
    await upsertCookedMealStrict(householdId, cookedMealInput({ cookedOn, starRating, dishes: [made(recipeId)] }))
  }

  async function seedSortable() {
    const applePie = await upsertRecipeStrict(householdId, recipeInput({ name: 'Apple Pie' }))
    const bananaBread = await upsertRecipeStrict(householdId, recipeInput({ name: 'banana Bread' }))
    const cherryTart = await upsertRecipeStrict(householdId, recipeInput({ name: 'Cherry Tart' }))
    const dateLoaf = await upsertRecipeStrict(householdId, recipeInput({ name: 'date loaf' }))
    const eggplantParm = await upsertRecipeStrict(householdId, recipeInput({ name: 'Eggplant Parm' }))
    await cook(applePie.id, '2026-10-03', 4)
    await cook(applePie.id, '2026-10-04', 4)
    await cook(applePie.id, '2026-10-05', 5)
    await cook(bananaBread.id, '2026-09-01', 4)
    await cook(bananaBread.id, '2026-09-02', 4)
    await cook(bananaBread.id, '2026-09-03', 4)
    await cook(bananaBread.id, '2026-09-04', 5)
    await cook(cherryTart.id, '2026-10-05', null)
    return { applePie, bananaBread, cherryTart, dateLoaf, eggplantParm }
  }

  const idsOf = (recipes: { id: string }[]) => recipes.map((recipe) => recipe.id)
  const byIdAsc = (recipes: { id: string }[]) => sortBy(idsOf(recipes))
  const byIdDesc = (recipes: { id: string }[]) => byIdAsc(recipes).reverse()

  async function collectPages(sort: RecipeSort, limit: number, cursor?: string): Promise<string[]> {
    const page = await listRecipes(householdId, { sort, limit, cursor })
    const ids = idsOf(page.recipes)
    return page.nextCursor === null ? ids : [...ids, ...(await collectPages(sort, limit, page.nextCursor))]
  }

  it('filters by name, case-insensitively', async () => {
    await upsertRecipeStrict(householdId, recipeInput({ name: 'Turkey Meatloaf' }))
    await upsertRecipeStrict(householdId, recipeInput({ name: 'Strawberry Harvest Salad', ingredients: [] }))

    const { recipes } = await listRecipes(householdId, { q: 'MEATLOAF', sort: 'name', limit: 10 })

    expect(recipes.map((recipe) => recipe.name)).toEqual(['Turkey Meatloaf'])
  })

  it('finds a recipe by one of its ingredients', async () => {
    await upsertRecipeStrict(
      householdId,
      recipeInput({ name: 'Sloppy Joes', ingredients: [{ name: 'Ground Turkey', quantity: 1, unit: 'lb', notes: null }] })
    )
    await upsertRecipeStrict(
      householdId,
      recipeInput({ name: 'Pancakes', ingredients: [{ name: 'flour', quantity: 2, unit: 'cups', notes: null }] })
    )

    const { recipes } = await listRecipes(householdId, { q: 'TURKEY', sort: 'name', limit: 10 })

    expect(recipes.map((recipe) => recipe.name)).toEqual(['Sloppy Joes'])
  })

  it('lists a recipe matching by name and by ingredient once', async () => {
    await upsertRecipeStrict(
      householdId,
      recipeInput({
        name: 'Turkey Chili',
        ingredients: [
          { name: 'ground turkey', quantity: 1, unit: 'lb', notes: null },
          { name: 'turkey stock', quantity: 2, unit: 'cups', notes: null }
        ]
      })
    )

    const { recipes } = await listRecipes(householdId, { q: 'turkey', sort: 'name', limit: 10 })

    expect(recipes.map((recipe) => recipe.name)).toEqual(['Turkey Chili'])
  })

  it('treats LIKE wildcards in the search as literal text', async () => {
    await upsertRecipeStrict(householdId, recipeInput({ name: '100% Whole Wheat Bread' }))
    await upsertRecipeStrict(householdId, recipeInput({ name: 'Pancakes' }))

    const { recipes } = await listRecipes(householdId, { q: '%', sort: 'name', limit: 10 })

    expect(recipes.map((recipe) => recipe.name)).toEqual(['100% Whole Wheat Bread'])
  })

  it('filters by a tag, canonicalizing mixed-case input', async () => {
    await upsertRecipeStrict(householdId, recipeInput({ name: 'Tacos', tags: ['Weeknight', 'mexican'] }))
    await upsertRecipeStrict(householdId, recipeInput({ name: 'Roast Chicken', tags: ['weekend'] }))
    await upsertRecipeStrict(householdId, recipeInput({ name: 'Toast', tags: [] }))

    const { recipes } = await listRecipes(householdId, { tag: '  WeekNight ', sort: 'name', limit: 10 })

    expect(recipes.map((recipe) => recipe.name)).toEqual(['Tacos'])
  })

  it('returns an empty page for an unknown tag', async () => {
    await upsertRecipeStrict(householdId, recipeInput({ tags: ['weeknight'] }))

    expect(await listRecipes(householdId, { tag: 'brunch', sort: 'name', limit: 10 })).toEqual({
      recipes: [],
      nextCursor: null
    })
  })

  it('sorts recentlyMade newest first, never-made last, ties by id', async () => {
    const { applePie, bananaBread, cherryTart, dateLoaf, eggplantParm } = await seedSortable()

    const { recipes } = await listRecipes(householdId, { sort: 'recentlyMade', limit: 10 })

    expect(idsOf(recipes)).toEqual([
      ...byIdDesc([applePie, cherryTart]),
      bananaBread.id,
      ...byIdDesc([dateLoaf, eggplantParm])
    ])
  })

  it('sorts longestAgo oldest first, never-made last, ties by id', async () => {
    const { applePie, bananaBread, cherryTart, dateLoaf, eggplantParm } = await seedSortable()

    const { recipes } = await listRecipes(householdId, { sort: 'longestAgo', limit: 10 })

    expect(idsOf(recipes)).toEqual([
      bananaBread.id,
      ...byIdAsc([applePie, cherryTart]),
      ...byIdAsc([dateLoaf, eggplantParm])
    ])
  })

  it('sorts by name A to Z, case-insensitively, ties by id', async () => {
    await seedSortable()
    const chili = await upsertRecipeStrict(householdId, recipeInput({ name: 'Chili' }))
    const lowerChili = await upsertRecipeStrict(householdId, recipeInput({ name: 'chili' }))

    const { recipes } = await listRecipes(householdId, { sort: 'name', limit: 10 })

    expect(recipes.map((recipe) => recipe.name.toLowerCase())).toEqual([
      'apple pie',
      'banana bread',
      'cherry tart',
      'chili',
      'chili',
      'date loaf',
      'eggplant parm'
    ])
    expect(idsOf(recipes.filter((recipe) => recipe.name.toLowerCase() === 'chili'))).toEqual(byIdAsc([chili, lowerChili]))
  })

  it('sorts by the unrounded average rating, highest first, unrated last, ties by id', async () => {
    const { applePie, bananaBread, cherryTart, dateLoaf, eggplantParm } = await seedSortable()

    const { recipes } = await listRecipes(householdId, { sort: 'rating', limit: 10 })

    expect(recipes.slice(0, 2).map((recipe) => recipe.stats.averageRating)).toEqual([4.3, 4.3])
    expect(idsOf(recipes)).toEqual([applePie.id, bananaBread.id, ...byIdDesc([cherryTart, dateLoaf, eggplantParm])])
  })

  it.each(['recentlyMade', 'longestAgo', 'name', 'rating'] as const)(
    'pages %s one recipe at a time without repeating or skipping a recipe',
    async (sort) => {
      await seedSortable()
      const { recipes } = await listRecipes(householdId, { sort, limit: 10 })

      expect(await collectPages(sort, 1)).toEqual(idsOf(recipes))
    }
  )

  it.each(['recentlyMade', 'longestAgo', 'name', 'rating'] as const)(
    'keeps stats null for never-made and unrated recipes when sorting by %s',
    async (sort) => {
      const { cherryTart, dateLoaf } = await seedSortable()

      const { recipes } = await listRecipes(householdId, { sort, limit: 10 })

      expect(recipes.find((recipe) => recipe.id === dateLoaf.id)?.stats).toEqual({
        averageRating: null,
        ratingCount: 0,
        timesMade: 0,
        lastMadeOn: null
      })
      expect(recipes.find((recipe) => recipe.id === cherryTart.id)?.stats).toEqual({
        averageRating: null,
        ratingCount: 0,
        timesMade: 1,
        lastMadeOn: '2026-10-05'
      })
    }
  )

  it('rejects a cursor from another sort', async () => {
    await seedSortable()
    const { nextCursor } = await listRecipes(householdId, { sort: 'recentlyMade', limit: 1 })

    await expect(
      listRecipes(householdId, { sort: 'longestAgo', limit: 1, cursor: nextCursor ?? '' })
    ).rejects.toBeInstanceOf(InvalidCursorError)
    await expect(listRecipes(householdId, { sort: 'name', limit: 1, cursor: nextCursor ?? '' })).rejects.toBeInstanceOf(
      InvalidCursorError
    )
  })

  it('rejects a malformed cursor', async () => {
    await expect(listRecipes(householdId, { sort: 'name', limit: 2, cursor: 'not-a-cursor' })).rejects.toBeInstanceOf(
      InvalidCursorError
    )
  })
})

describe('deleteRecipe', () => {
  it('returns the deleted id, then null on a repeat', async () => {
    const recipe = await upsertRecipeStrict(householdId, recipeInput())

    expect(await deleteRecipe(householdId, recipe.id)).toEqual({ id: recipe.id })
    expect(await deleteRecipe(householdId, recipe.id)).toBeNull()
    expect(await getRecipe(householdId, recipe.id)).toBeNull()
  })

  it('leaves the shared vocabulary in place', async () => {
    const recipe = await upsertRecipeStrict(
      householdId,
      recipeInput({ ingredients: [{ name: 'sumac', quantity: 1, unit: 'tsp', notes: null }] })
    )

    await deleteRecipe(householdId, recipe.id)

    expect(await DB.queryOne(`SELECT 1 FROM ingredients WHERE name = 'sumac'`)).not.toBeNull()
  })
})
