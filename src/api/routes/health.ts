import { Hono } from 'hono'

export const health = new Hono().get('/', (c) => {
  throw new Error('Not implemented')
})
