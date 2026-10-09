import { RecipeSchemas } from '@rotisserie/shared/recipes'
import { omit } from 'lodash-es'
import z from 'zod'
import { listRecipeStats } from '~/providers/cooked-meals'
import { getRecipeStrict } from '~/providers/recipes'
import { defineUseCase } from '../define-use-case'

export const GetRecipeById = defineUseCase({
  input: z.object({ id: z.uuid() }),
  output: RecipeSchemas.RecipeWithStats,
  implementation: async ({ id }) => {
    const recipe = await getRecipeStrict(id)
    const [stats] = await listRecipeStats([recipe.id])
    return { ...recipe, stats: omit(stats, 'recipeId') }
  }
})
