import { describe, it } from 'vitest'

describe('GET /recipes', () => {
  it.todo('pages recipes with a cursor')
  it.todo('filters by q')
  it.todo('returns 400 for a malformed cursor')
})

describe('GET /recipes/:id', () => {
  it.todo('returns the recipe with ingredients and tags')
  it.todo('returns 404 for an unknown id')
})

describe('PUT /recipes/:id', () => {
  it.todo('creates a recipe on first upsert and updates it on the second')
  it.todo('returns 400 with field errors for an invalid body')
})

describe('DELETE /recipes/:id', () => {
  it.todo('returns 204, then 404 on a repeat')
})
