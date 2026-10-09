import { randomUUID } from 'node:crypto'
import { RecipeSchemas } from '@rotisserie/shared/recipes'
import { orderBy } from 'lodash-es'
import { describe, expect, it } from 'vitest'
import { DB } from '~/db/connection'
import { recipeInput } from '~/test/factories'
import { getRecipe, deleteRecipe, listRecipes, upsertRecipe } from './recipes'
import { InvalidCursorError } from './sql'

describe('upsertRecipe', () => {
  it('creates a recipe whose shape matches the shared schema', async () => {
    const input = recipeInput({
      ingredients: [
        { name: 'Ground Turkey', quantity: 1.5, unit: 'lbs', notes: null },
        { name: 'onion', quantity: 1, unit: null, notes: 'diced' }
      ],
      tags: ['Weeknight', 'turkey']
    })

    const recipe = await upsertRecipe(input)

    expect(() => RecipeSchemas.Recipe.parse(recipe)).not.toThrow()
    expect(recipe).toMatchObject({ id: input.id, name: 'Turkey Sloppy Joes', servings: 4 })
    expect(recipe.ingredients).toMatchObject([
      { ingredient: { name: 'ground turkey' }, quantity: 1.5, unit: { name: 'pound' }, sortOrder: 0 },
      { ingredient: { name: 'onion' }, quantity: 1, unit: null, notes: 'diced', sortOrder: 1 }
    ])
    expect(recipe.tags.map((tag) => tag.name)).toEqual(['turkey', 'weeknight'])
  })

  it('replaces the recipe, its lines and its tags on a second upsert with the same id', async () => {
    const first = await upsertRecipe(recipeInput())

    const second = await upsertRecipe(
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
    expect((await listRecipes({ limit: 10 })).recipes).toHaveLength(1)
  })

  it('allows the same ingredient on two lines', async () => {
    const recipe = await upsertRecipe(
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

    await expect(upsertRecipe(input)).rejects.toMatchObject({ code: '23514' })
    expect(await getRecipe(input.id)).toBeNull()
  })
})

describe('getRecipe', () => {
  it('returns null for an unknown id', async () => {
    expect(await getRecipe(randomUUID())).toBeNull()
  })
})

describe('listRecipes', () => {
  it('filters by name, case-insensitively', async () => {
    await upsertRecipe(recipeInput({ name: 'Turkey Meatloaf' }))
    await upsertRecipe(recipeInput({ name: 'Strawberry Harvest Salad' }))

    const { recipes } = await listRecipes({ q: 'TURKEY', limit: 10 })

    expect(recipes.map((recipe) => recipe.name)).toEqual(['Turkey Meatloaf'])
  })

  it('treats LIKE wildcards in the search as literal text', async () => {
    await upsertRecipe(recipeInput({ name: '100% Whole Wheat Bread' }))
    await upsertRecipe(recipeInput({ name: 'Pancakes' }))

    const { recipes } = await listRecipes({ q: '%', limit: 10 })

    expect(recipes.map((recipe) => recipe.name)).toEqual(['100% Whole Wheat Bread'])
  })

  it('pages newest first without repeating or skipping a recipe', async () => {
    const created = await Promise.all(['A', 'B', 'C', 'D', 'E'].map((name) => upsertRecipe(recipeInput({ name }))))
    const newestFirst = orderBy(created, ['createdAt', 'id'], ['desc', 'desc']).map((recipe) => recipe.id)

    const collectPages = async (cursor?: string): Promise<string[]> => {
      const page = await listRecipes({ limit: 2, cursor })
      const ids = page.recipes.map((recipe) => recipe.id)
      return page.nextCursor === null ? ids : [...ids, ...(await collectPages(page.nextCursor))]
    }

    expect(await collectPages()).toEqual(newestFirst)
  })

  it('rejects a malformed cursor', async () => {
    await expect(listRecipes({ limit: 2, cursor: 'not-a-cursor' })).rejects.toBeInstanceOf(InvalidCursorError)
  })
})

describe('deleteRecipe', () => {
  it('returns the deleted id, then null on a repeat', async () => {
    const recipe = await upsertRecipe(recipeInput())

    expect(await deleteRecipe(recipe.id)).toEqual({ id: recipe.id })
    expect(await deleteRecipe(recipe.id)).toBeNull()
    expect(await getRecipe(recipe.id)).toBeNull()
  })

  it('leaves the shared vocabulary in place', async () => {
    const recipe = await upsertRecipe(
      recipeInput({ ingredients: [{ name: 'sumac', quantity: 1, unit: 'tsp', notes: null }] })
    )

    await deleteRecipe(recipe.id)

    expect(await DB.queryOne(`SELECT 1 FROM ingredients WHERE name = 'sumac'`)).not.toBeNull()
  })
})
