import { afterEach, describe, expect, it, vi } from 'vitest'
import { importRecipe, importUrlFrom } from './import'

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
    [403, 'That site refused the request. Try copying the recipe in by hand.'],
    [404, 'That page does not exist. Check the link and try again.'],
    [500, 'That page could not be loaded (500).']
  ])('explains a %s', async (status, message) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => page('<html></html>', status))
    )
    await expect(importRecipe('https://example.com/chili')).rejects.toThrow(message)
  })

  it('explains a page without a recipe', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => page('<html><body><h1>About</h1></body></html>'))
    )
    await expect(importRecipe('https://example.com/about')).rejects.toThrow('No recipe was found on that page')
  })

  it('explains a network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Network request failed')))
    )
    await expect(importRecipe('https://example.com/chili')).rejects.toThrow('Could not reach that site')
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
    const outcome = expect(attempt).rejects.toThrow('That site took too long to answer.')
    await vi.advanceTimersByTimeAsync(15_000)
    await outcome
  })
})
