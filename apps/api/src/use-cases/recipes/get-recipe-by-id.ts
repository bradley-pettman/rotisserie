import { RecipeSchemas } from '@rotisserie/shared/recipes'
import { omit } from 'lodash-es'
import z from 'zod'
import { listRecipeStats } from '~/providers/cooked-meals'
import { getRecipeStrict } from '~/providers/recipes'
import { MemberActor } from '../actors'
import { defineUseCase } from '../define-use-case'

export const GetRecipeById = defineUseCase({
  actor: MemberActor,
  input: z.object({ id: z.uuid() }),
  output: RecipeSchemas.RecipeWithStats,
  implementation: async ({ id }, { householdId }) => {
    const recipe = await getRecipeStrict(householdId, id)
    const [stats] = await listRecipeStats(householdId, [recipe.id])
    return { ...recipe, stats: omit(stats, 'recipeId') }
  }
})
