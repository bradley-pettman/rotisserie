import {
  extractRecipe,
  ImportAttemptSchemas,
  importedOutcome,
  missingImportFields,
  type ImportedRecipe
} from '@rotisserie/shared/recipes'
import z from 'zod'
import { api } from './client'

const TIMEOUT_MS = 15_000
const MAX_CHARS = 2_000_000

export type ImportedRecipeDraft = ImportedRecipe & { url: string }

type ImportAttempt = ImportAttemptSchemas['RecordImportAttemptInput']
type ImportFailureOutcome = ImportAttemptSchemas['ImportFailureOutcome']

export class ImportFailure extends Error {
  constructor(
    message: string,
    readonly outcome: ImportFailureOutcome,
    readonly status: number | null = null
  ) {
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

function failure(status: number): ImportFailure {
  if (status === 401 || status === 402 || status === 403)
    return new ImportFailure('That site refused the request. Try copying the recipe in by hand.', 'refused', status)
  if (status === 404 || status === 410)
    return new ImportFailure('That page does not exist. Check the link and try again.', 'not_found', status)
  return new ImportFailure(`That page could not be loaded (${status}).`, 'http_error', status)
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
    if (!response.ok) throw failure(response.status)
    html = (await response.text()).slice(0, MAX_CHARS)
  } catch (error) {
    if (error instanceof ImportFailure) throw error
    throw controller.signal.aborted
      ? new ImportFailure('That site took too long to answer.', 'timeout')
      : new ImportFailure('Could not reach that site. Check the link and your connection.', 'unreachable')
  } finally {
    clearTimeout(timer)
  }
  const recipe = extractRecipe(html)
  if (!recipe) throw new ImportFailure('No recipe was found on that page. You can still fill it in by hand.', 'no_recipe')
  return { ...recipe, url: response.url || url }
}

export function importAttemptFor(url: string, result: { draft: ImportedRecipe } | { error: unknown }): ImportAttempt {
  if ('draft' in result) {
    const missingFields = missingImportFields(result.draft)
    return { url, outcome: importedOutcome(missingFields), httpStatus: null, missingFields }
  }
  const { error } = result
  return error instanceof ImportFailure
    ? { url, outcome: error.outcome, httpStatus: error.status, missingFields: [] }
    : { url, outcome: 'unreachable', httpStatus: null, missingFields: [] }
}

export function reportImport(attempt: ImportAttempt): void {
  api.post(z.null(), '/recipe-imports', attempt).catch(() => undefined)
}
