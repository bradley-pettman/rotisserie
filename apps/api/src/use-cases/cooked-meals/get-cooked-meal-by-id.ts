import { CookedMealSchemas } from '@rotisserie/shared/meals'
import z from 'zod'
import { getCookedMealStrict } from '~/providers/cooked-meals'
import { MemberActor } from '../actors'
import { defineUseCase } from '../define-use-case'

export const GetCookedMealById = defineUseCase({
  actor: MemberActor,
  input: z.object({ id: z.uuid() }),
  output: CookedMealSchemas.CookedMeal,
  implementation: async ({ id }, { householdId }) => getCookedMealStrict(householdId, id)
})
