import { Hono } from 'hono'

export const cookedMeals = new Hono()
  .get('/', (c) => {
    throw new Error('Not implemented')
  })
  .get('/:id', (c) => {
    throw new Error('Not implemented')
  })
  .put('/:id', (c) => {
    throw new Error('Not implemented')
  })
  .delete('/:id', (c) => {
    throw new Error('Not implemented')
  })
