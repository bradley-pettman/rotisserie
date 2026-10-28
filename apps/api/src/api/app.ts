import { Hono } from 'hono'
import { handleError, handleNotFound } from './errors'
import { auth } from './routes/auth'
import { cookedMeals } from './routes/cooked-meals'
import { health } from './routes/health'
import { household } from './routes/household'
import { me } from './routes/me'
import { meals } from './routes/meals'
import { plannedMeals } from './routes/planned-meals'
import { recipes } from './routes/recipes'
import { vocabulary } from './routes/vocabulary'

export const app = new Hono()
  .route('/health', health)
  .route('/auth', auth)
  .route('/me', me)
  .route('/household', household)
  .route('/recipes', recipes)
  .route('/', vocabulary)
  .route('/meals', meals)
  .route('/planned-meals', plannedMeals)
  .route('/cooked-meals', cookedMeals)
  .onError(handleError)
  .notFound(handleNotFound)

export type App = typeof app
