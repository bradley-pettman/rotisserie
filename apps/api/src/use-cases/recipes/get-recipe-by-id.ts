import { RecipeSchemas } from '@rotisserie/shared/recipes'
import z from 'zod'
import { getRecipeStrict } from '~/providers/recipes'
import { defineUseCase } from '../define-use-case'

export const GetRecipeById = defineUseCase({
  input: z.object({ id: z.uuid() }),
  output: RecipeSchemas.Recipe,
  implementation: async ({ id }) => getRecipeStrict(id)
})
