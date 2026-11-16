import { canonicalizeName, parseIngredientLine, pluralizeName, STANDARD_UNIT_NAMES } from '../base'
import type { GrocerySection } from './sections'

export type ItemDefault = { name: string; storeId: string | null; section: GrocerySection | null }

export type IngredientSection = { name: string; section: GrocerySection | null }

export function groceryNameKeys(text: string): string[] {
  const name = parseIngredientLine(text, STANDARD_UNIT_NAMES).name || canonicalizeName(text)
  const spellings = [
    name.replace(/ies$/, 'y'),
    name.replace(/(ch|sh|x|z|ss|o)es$/, '$1'),
    name.replace(/([^su])s$/, '$1'),
    name.endsWith('s') ? name : pluralizeName(name)
  ]
  return [...new Set([name, ...spellings])].filter((key) => key.length > 0)
}

export function defaultsFor(
  keys: string[],
  defaults: ItemDefault[],
  ingredients: IngredientSection[]
): { storeId: string | null; section: GrocerySection | null } {
  const learned = keys.flatMap((key) => defaults.filter((entry) => entry.name === key))
  const known = keys.flatMap((key) => ingredients.filter((entry) => entry.name === key))
  return {
    storeId: learned.find((entry) => entry.storeId !== null)?.storeId ?? null,
    section:
      learned.find((entry) => entry.section !== null)?.section ??
      known.find((entry) => entry.section !== null)?.section ??
      null
  }
}
