import { handle } from 'hono/aws-lambda'
import { app } from './api/app'

export const handler = handle(app)
