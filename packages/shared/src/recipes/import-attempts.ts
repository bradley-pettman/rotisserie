import z from 'zod'
import type { InferSchemas } from '../lib/schemas'
import type { ImportedRecipe } from './import'

const ImportOutcome = z.enum([
  'imported',
  'partial',
  'no_recipe',
  'refused',
  'not_found',
  'http_error',
  'timeout',
  'unreachable'
])

const ImportFailureOutcome = ImportOutcome.exclude(['imported', 'partial'])

const ImportField = z.enum(['name', 'ingredients', 'steps', 'times', 'servings'])

const RecordImportAttemptInput = z.object({
  url: z.url({ protocol: /^https?$/ }).max(2048),
  outcome: ImportOutcome,
  httpStatus: z.number().int().min(100).max(599).nullable(),
  missingFields: ImportField.array().max(ImportField.options.length)
})

const ImportAttempt = z.object({
  id: z.string(),
  url: z.string(),
  host: z.string(),
  outcome: ImportOutcome,
  httpStatus: z.number().int().nullable(),
  missingFields: ImportField.array(),
  createdAt: z.iso.datetime()
})

const ListImportAttemptsQuery = z.object({
  outcome: ImportOutcome.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100)
})

export const ImportAttemptSchemas = {
  ImportOutcome,
  ImportFailureOutcome,
  ImportField,
  RecordImportAttemptInput,
  ImportAttempt,
  ListImportAttemptsQuery
}

export type ImportAttemptSchemas = InferSchemas<typeof ImportAttemptSchemas>

type ImportField = ImportAttemptSchemas['ImportField']

export function missingImportFields(recipe: ImportedRecipe): ImportField[] {
  const missing: ImportField[] = []
  if (!recipe.name) missing.push('name')
  if (recipe.ingredients.length === 0) missing.push('ingredients')
  if (recipe.steps.length === 0) missing.push('steps')
  if (recipe.prepTimeMinutes === null && recipe.cookTimeMinutes === null && recipe.totalTimeMinutes === null) {
    missing.push('times')
  }
  if (recipe.servings === null) missing.push('servings')
  return missing
}

export function importedOutcome(missing: ImportField[]): 'imported' | 'partial' {
  return missing.some((field) => field === 'name' || field === 'ingredients' || field === 'steps') ? 'partial' : 'imported'
}
