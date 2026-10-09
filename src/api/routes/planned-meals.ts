import { Hono } from 'hono'

export const plannedMeals = new Hono()
  .get('/:id', (c) => {
    throw new Error('Not implemented')
  })
  .put('/:id', (c) => {
    throw new Error('Not implemented')
  })
  .delete('/:id', (c) => {
    throw new Error('Not implemented')
  })
  .post('/:id/dishes', (c) => {
    throw new Error('Not implemented')
  })
  .delete('/:id/dishes/:dishId', (c) => {
    throw new Error('Not implemented')
  })
