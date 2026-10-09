import { Hono } from 'hono'

export const vocabulary = new Hono()
  .get('/ingredients', (c) => {
    throw new Error('Not implemented')
  })
  .get('/units', (c) => {
    throw new Error('Not implemented')
  })
  .get('/tags', (c) => {
    throw new Error('Not implemented')
  })
