import { PlannedMealSchemas } from '@rotisserie/shared/meals'
import z from 'zod'
import { NotFoundError } from '~/providers/errors'
import { getPlannedMealStrict, removePlannedDishStrict } from '~/providers/planned-meals'
import { MemberActor } from '../actors'
import { defineUseCase } from '../define-use-case'

export const RemovePlannedDish = defineUseCase({
  actor: MemberActor,
  input: z.object({
    plannedMealId: z.uuid(),
    dishId: z.uuid()
  }),
  output: PlannedMealSchemas.PlannedMeal,
  implementation: async ({ plannedMealId, dishId }, { householdId }) => {
    const meal = await getPlannedMealStrict(householdId, plannedMealId)
    if (!meal.dishes.some((dish) => dish.id === dishId)) throw new NotFoundError('Dish not found')
    return removePlannedDishStrict(householdId, dishId)
  }
})
