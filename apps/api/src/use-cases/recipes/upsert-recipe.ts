import { RecipeSchemas } from '@rotisserie/shared/recipes'
import { upsertRecipe } from '~/providers/recipes'
import { defineUseCase } from '../define-use-case'

export const UpsertRecipe = defineUseCase({
  input: RecipeSchemas.UpsertRecipeInput,
  output: RecipeSchemas.Recipe,
  implementation: async (input) => upsertRecipe(input)
})
