import { describe, it } from 'vitest'

describe('PUT /planned-meals/:id', () => {
  it.todo('creates and then replaces a planned meal')
  it.todo('returns 409 when the slot is already planned')
})

describe('GET /planned-meals/:id', () => {
  it.todo('returns 404 for an unknown id')
})

describe('DELETE /planned-meals/:id', () => {
  it.todo('returns 204, then 404 on a repeat')
})

describe('POST /planned-meals/:id/dishes', () => {
  it.todo('appends a dish and returns the meal')
  it.todo('returns 404 for an unknown meal')
})

describe('DELETE /planned-meals/:id/dishes/:dishId', () => {
  it.todo('removes the dish and returns the meal')
})
