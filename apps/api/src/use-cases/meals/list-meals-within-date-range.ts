import { CookedMealSchemas, PlannedMealSchemas } from '@rotisserie/shared/meals'
import z from 'zod'
import { listCookedMealsWithinDateRange } from '~/providers/cooked-meals'
import { listPlannedMealsWithinDateRange } from '~/providers/planned-meals'
import { defineUseCase } from '../define-use-case'

export const ListMealsWithinDateRange = defineUseCase({
  input: z
    .object({
      from: z.iso.date(),
      to: z.iso.date()
    })
    .refine((range) => range.from <= range.to, { message: 'from must be on or before to', path: ['to'] }),
  output: z.object({
    planned: PlannedMealSchemas.PlannedMeal.array(),
    cooked: CookedMealSchemas.CookedMeal.array()
  }),
  implementation: async ({ from, to }) => {
    const [planned, cooked] = await Promise.all([
      listPlannedMealsWithinDateRange(from, to),
      listCookedMealsWithinDateRange(from, to)
    ])
    return { planned, cooked }
  }
})
