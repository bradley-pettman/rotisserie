import { RecipeSchemas } from '@rotisserie/shared/recipes'
import { keyBy, omit } from 'lodash-es'
import z from 'zod'
import { listRecipeStats } from '~/providers/cooked-meals'
import { listRecipes } from '~/providers/recipes'
import { defineUseCase } from '../define-use-case'

export const ListRecipes = defineUseCase({
  input: z.object({
    q: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().optional()
  }),
  output: RecipeSchemas.RecipeWithStatsPage,
  implementation: async (input) => {
    const page = await listRecipes(input)
    const statsById = keyBy(await listRecipeStats(page.recipes.map((recipe) => recipe.id)), 'recipeId')
    return {
      ...page,
      recipes: page.recipes.map((recipe) => ({ ...recipe, stats: omit(statsById[recipe.id], 'recipeId') }))
    }
  }
})
