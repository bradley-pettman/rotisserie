import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImportFailure, importAttemptFor, importRecipe, importUrlFrom, reportImport } from './import'

const recipePage = `<html><head><script type="application/ld+json">${JSON.stringify({
  '@type': 'Recipe',
  name: 'Chili',
  recipeIngredient: ['1 lb beef'],
  recipeInstructions: 'Cook it.'
})}</script></head></html>`

function page(body: string, status = 200, url = ''): Response {
  const response = new Response(body, { status, headers: { 'content-type': 'text/html' } })
  if (url) Object.defineProperty(response, 'url', { value: url })
  return response
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('importUrlFrom', () => {
  it.each([
    ['https://www.bbcgoodfood.com/recipes/classic-lasagne', 'https://www.bbcgoodfood.com/recipes/classic-lasagne'],
    ['  bbcgoodfood.com/recipes/classic-lasagne ', 'https://bbcgoodfood.com/recipes/classic-lasagne'],
    ['HTTP://Example.com', 'HTTP://Example.com'],
    ['', null],
    ['not a link', null],
    ['ftp://files.example.com/recipe', null],
    ['localhost/recipes', null]
  ])('turns %j into %j', (input, expected) => {
    expect(importUrlFrom(input)).toBe(expected)
  })
})

describe('importRecipe', () => {
  it('returns the draft with the final url', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => page(recipePage, 200, 'https://example.com/chili-final'))
    )
    await expect(importRecipe('https://example.com/chili')).resolves.toMatchObject({
      name: 'Chili',
      ingredients: ['1 lb beef'],
      steps: ['Cook it.'],
      url: 'https://example.com/chili-final'
    })
  })

  it('keeps the requested url when the response has none', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => page(recipePage))
    )
    await expect(importRecipe('https://example.com/chili')).resolves.toMatchObject({ url: 'https://example.com/chili' })
  })

  it('sends the request with a timeout signal and a plain user agent', async () => {
    const fetchMock = vi.fn(async () => page(recipePage))
    vi.stubGlobal('fetch', fetchMock)
    await importRecipe('https://example.com/chili')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://example.com/chili')
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(init.headers).toMatchObject({ 'User-Agent': expect.stringContaining('Rotisserie') })
  })

  it.each([
    [403, 'That site refused the request. Try copying the recipe in by hand.', 'refused'],
    [404, 'That page does not exist. Check the link and try again.', 'not_found'],
    [500, 'That page could not be loaded (500).', 'http_error']
  ])('explains a %s', async (status, message, outcome) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => page('<html></html>', status))
    )
    const attempt = importRecipe('https://example.com/chili')
    await expect(attempt).rejects.toThrow(message)
    await expect(attempt).rejects.toMatchObject({ outcome, status })
  })

  it('explains a page without a recipe', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => page('<html><body><h1>About</h1></body></html>'))
    )
    const attempt = importRecipe('https://example.com/about')
    await expect(attempt).rejects.toThrow('No recipe was found on that page')
    await expect(attempt).rejects.toMatchObject({ outcome: 'no_recipe', status: null })
  })

  it('explains a network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Network request failed')))
    )
    await expect(importRecipe('https://example.com/chili')).rejects.toMatchObject({
      message: expect.stringContaining('Could not reach that site'),
      outcome: 'unreachable'
    })
  })

  it('gives up after the timeout', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))))
      )
    )
    const attempt = importRecipe('https://example.com/slow')
    const outcome = expect(attempt).rejects.toMatchObject({
      message: 'That site took too long to answer.',
      outcome: 'timeout'
    })
    await vi.advanceTimersByTimeAsync(15_000)
    await outcome
  })
})

describe('importAttemptFor', () => {
  const url = 'https://example.com/chili'
  const draft = {
    name: 'Chili',
    ingredients: ['1 lb beef'],
    steps: [],
    prepTimeMinutes: null,
    cookTimeMinutes: 30,
    totalTimeMinutes: null,
    servings: null
  }

  it('reports a draft without steps as partial, with what was missing', () => {
    expect(importAttemptFor(url, { draft })).toEqual({
      url,
      outcome: 'partial',
      httpStatus: null,
      missingFields: ['steps', 'servings']
    })
  })

  it('reports a full draft as imported', () => {
    expect(importAttemptFor(url, { draft: { ...draft, steps: ['Cook it.'], servings: 4 } })).toMatchObject({
      outcome: 'imported',
      missingFields: []
    })
  })

  it('reports a failure with its outcome and status', () => {
    expect(importAttemptFor(url, { error: new ImportFailure('refused', 'refused', 402) })).toEqual({
      url,
      outcome: 'refused',
      httpStatus: 402,
      missingFields: []
    })
  })

  it('reports an unexpected error as unreachable', () => {
    expect(importAttemptFor(url, { error: new Error('boom') })).toMatchObject({ outcome: 'unreachable' })
  })
})

describe('reportImport', () => {
  const attempt: Parameters<typeof reportImport>[0] = {
    url: 'https://example.com/chili',
    outcome: 'timeout',
    httpStatus: null,
    missingFields: []
  }

  it('posts the attempt to the API', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    reportImport(attempt)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(/\/recipe-imports$/)
    expect(init).toMatchObject({ method: 'POST' })
    expect(JSON.parse(init.body as string)).toEqual(attempt)
  })

  it('swallows a failed report', async () => {
    const fetchMock = vi.fn(async () => Promise.reject(new TypeError('Network request failed')))
    vi.stubGlobal('fetch', fetchMock)
    expect(() => reportImport(attempt)).not.toThrow()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
  })
})
