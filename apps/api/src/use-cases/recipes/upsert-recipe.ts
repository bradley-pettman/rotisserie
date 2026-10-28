import { RecipeSchemas } from '@rotisserie/shared/recipes'
import { upsertRecipeStrict } from '~/providers/recipes'
import { MemberActor } from '../actors'
import { defineUseCase } from '../define-use-case'

export const UpsertRecipe = defineUseCase({
  actor: MemberActor,
  input: RecipeSchemas.UpsertRecipeInput,
  output: RecipeSchemas.Recipe,
  implementation: async (input, { householdId }) => upsertRecipeStrict(householdId, input)
})
