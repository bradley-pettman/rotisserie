import { PlannedMealSchemas } from '@rotisserie/shared/meals'
import z from 'zod'
import { NotFoundError } from '~/providers/errors'
import { getPlannedMealStrict, removePlannedDishStrict } from '~/providers/planned-meals'
import { defineUseCase } from '../define-use-case'

export const RemovePlannedDish = defineUseCase({
  input: z.object({
    plannedMealId: z.uuid(),
    dishId: z.uuid()
  }),
  output: PlannedMealSchemas.PlannedMeal,
  implementation: async ({ plannedMealId, dishId }) => {
    const meal = await getPlannedMealStrict(plannedMealId)
    if (!meal.dishes.some((dish) => dish.id === dishId)) throw new NotFoundError('Dish not found')
    return removePlannedDishStrict(dishId)
  }
})
