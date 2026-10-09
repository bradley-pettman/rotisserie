import { Hono } from 'hono'

export const meals = new Hono().get('/', (c) => {
  throw new Error('Not implemented')
})
