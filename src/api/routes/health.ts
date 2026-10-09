import { Hono } from 'hono'
import { CheckHealth } from '~/use-cases/health'

export const health = new Hono().get('/', async (c) => {
  const health = await CheckHealth({})
  return c.json(health, health.databaseReachable ? 200 : 503)
})
