import { describe, it } from 'vitest'

describe('PUT /cooked-meals/:id', () => {
  it.todo('logs a meal that replaces its plan')
  it.todo('returns 409 for a second cooked meal on the same plan')
})

describe('GET /cooked-meals', () => {
  it.todo('pages history newest first')
})

describe('GET /cooked-meals/:id', () => {
  it.todo('returns 404 for an unknown id')
})

describe('DELETE /cooked-meals/:id', () => {
  it.todo('returns 204, then 404 on a repeat')
})
