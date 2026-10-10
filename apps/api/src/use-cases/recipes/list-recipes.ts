import { RecipeSchemas } from '@rotisserie/shared/recipes'
import z from 'zod'
import { listRecipes } from '~/providers/recipes'
import { MemberActor } from '../actors'
import { defineUseCase } from '../define-use-case'

export const ListRecipes = defineUseCase({
  actor: MemberActor,
  input: z.object({
    q: z.string().optional(),
    tag: z.string().trim().optional(),
    sort: RecipeSchemas.RecipeSort.default('recentlyMade'),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().optional()
  }),
  output: RecipeSchemas.RecipeWithStatsPage,
  implementation: async (input, { householdId }) => listRecipes(householdId, input)
})
