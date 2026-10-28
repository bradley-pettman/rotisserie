import { CookedMealSchemas } from '@rotisserie/shared/meals'
import z from 'zod'
import { settlePlannedMealsBefore } from '~/providers/cooked-meals'
import { MemberActor } from '../actors'
import { defineUseCase } from '../define-use-case'

export const SettlePlannedMeals = defineUseCase({
  actor: MemberActor,
  input: z.object({ before: z.iso.date() }),
  output: CookedMealSchemas.CookedMeal.array(),
  implementation: async ({ before }, { householdId }) => settlePlannedMealsBefore(householdId, before)
})
