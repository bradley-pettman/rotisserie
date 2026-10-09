import { Hono } from 'hono'
import { handleError, handleNotFound } from './errors'
import { cookedMeals } from './routes/cooked-meals'
import { health } from './routes/health'
import { meals } from './routes/meals'
import { plannedMeals } from './routes/planned-meals'
import { recipes } from './routes/recipes'
import { vocabulary } from './routes/vocabulary'

export const app = new Hono()
  .route('/health', health)
  .route('/recipes', recipes)
  .route('/', vocabulary)
  .route('/meals', meals)
  .route('/planned-meals', plannedMeals)
  .route('/cooked-meals', cookedMeals)
  .onError(handleError)
  .notFound(handleNotFound)

export type App = typeof app
