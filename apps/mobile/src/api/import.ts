import { extractRecipe, type ImportedRecipe } from '@rotisserie/shared/recipes'

const TIMEOUT_MS = 15_000
const MAX_CHARS = 2_000_000

export type ImportedRecipeDraft = ImportedRecipe & { url: string }

export class ImportFailure extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImportFailure'
  }
}

export function importUrlFrom(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed || /\s/.test(trimmed)) return null
  const url = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  return /^https?:\/\/[^/?#\s]+\.[a-z]{2,}(?:[/?#]|$)/i.test(url) ? url : null
}

function failure(status: number): string {
  if (status === 401 || status === 402 || status === 403)
    return 'That site refused the request. Try copying the recipe in by hand.'
  if (status === 404 || status === 410) return 'That page does not exist. Check the link and try again.'
  return `That page could not be loaded (${status}).`
}

export async function importRecipe(url: string): Promise<ImportedRecipeDraft> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let response: Response
  let html: string
  try {
    response = await fetch(url, {
      headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'Mozilla/5.0 (compatible; Rotisserie/1.0)' },
      signal: controller.signal
    })
    if (!response.ok) throw new ImportFailure(failure(response.status))
    html = (await response.text()).slice(0, MAX_CHARS)
  } catch (error) {
    if (error instanceof ImportFailure) throw error
    throw new ImportFailure(
      controller.signal.aborted
        ? 'That site took too long to answer.'
        : 'Could not reach that site. Check the link and your connection.'
    )
  } finally {
    clearTimeout(timer)
  }
  const recipe = extractRecipe(html)
  if (!recipe) throw new ImportFailure('No recipe was found on that page. You can still fill it in by hand.')
  return { ...recipe, url: response.url || url }
}
