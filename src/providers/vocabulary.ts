import type { IngredientSchemas, TagSchemas, UnitSchemas } from '@rotisserie/shared/base'
import type { QueryFns } from '~/db/connection'

export async function listIngredients(options: { q?: string; limit: number }): Promise<IngredientSchemas['Ingredient'][]> {
  throw new Error('Not implemented: listIngredients')
}

export async function listUnits(): Promise<UnitSchemas['Unit'][]> {
  throw new Error('Not implemented: listUnits')
}

export async function listTags(): Promise<TagSchemas['Tag'][]> {
  throw new Error('Not implemented: listTags')
}

export async function upsertIngredients(tx: QueryFns, names: string[]): Promise<Map<string, string>> {
  throw new Error('Not implemented: upsertIngredients')
}

export async function upsertTags(tx: QueryFns, names: string[]): Promise<Map<string, string>> {
  throw new Error('Not implemented: upsertTags')
}

export async function resolveUnits(tx: QueryFns, names: string[]): Promise<Map<string, string>> {
  throw new Error('Not implemented: resolveUnits')
}
