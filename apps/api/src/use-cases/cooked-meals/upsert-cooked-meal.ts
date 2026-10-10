import { CookedMealSchemas } from '@rotisserie/shared/meals'
import { upsertCookedMealStrict } from '~/providers/cooked-meals'
import { MemberActor } from '../actors'
import { defineUseCase } from '../define-use-case'

export const UpsertCookedMeal = defineUseCase({
  actor: MemberActor,
  input: CookedMealSchemas.CookedMealInput,
  output: CookedMealSchemas.CookedMeal,
  implementation: async (input, { householdId }) => upsertCookedMealStrict(householdId, input)
})
