export const VULGAR_FRACTIONS: Record<string, number> = {
  '½': 1 / 2,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 1 / 4,
  '¾': 3 / 4,
  '⅛': 1 / 8,
  '⅜': 3 / 8,
  '⅝': 5 / 8,
  '⅞': 7 / 8
}
const GLYPHS: [number, string][] = Object.entries(VULGAR_FRACTIONS).map(([glyph, value]) => [value, glyph])

export function formatQuantity(value: number): string {
  const whole = Math.floor(value + 1e-9)
  const fraction = value - whole
  if (fraction < 0.02) return String(whole)
  if (fraction > 0.98) return String(whole + 1)
  const glyph = GLYPHS.find(([part]) => Math.abs(part - fraction) < 0.02)?.[1]
  if (glyph) return whole > 0 ? `${whole}${glyph}` : glyph
  return String(Math.round(value * 100) / 100)
}

const IRREGULAR_PLURALS: Record<string, string> = {
  leaf: 'leaves',
  'fluid ounce': 'fluid ounces',
  loaf: 'loaves',
  tomato: 'tomatoes',
  potato: 'potatoes'
}

export function pluralize(word: string): string {
  if (IRREGULAR_PLURALS[word]) return IRREGULAR_PLURALS[word]
  if (/(s|sh|ch|x|z)$/.test(word)) return `${word}es`
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`
  return `${word}s`
}

export function pluralizeName(name: string): string {
  const words = name.split(' ')
  const last = words.pop() ?? ''
  return [...words, pluralize(last)].join(' ')
}

export type AmountUnit = { name: string; abbreviation: string | null }

export function unitLabel(unit: AmountUnit, quantity: number | null): string {
  if (unit.abbreviation && unit.abbreviation !== unit.name) return unit.abbreviation
  return quantity !== null && quantity > 1 ? pluralize(unit.name) : unit.name
}

export function amountLabel(quantity: number | null, unit: AmountUnit | null): string {
  const parts = [quantity === null ? null : formatQuantity(quantity), unit ? unitLabel(unit, quantity) : null]
  return parts.filter((part) => part !== null).join(' ')
}

export function scaleFactor(servings: number | null, people: number): number {
  return servings && servings > 0 ? people / servings : 1
}

export type UnitMeasure = { dimension: 'volume' | 'weight'; base: number }

const MEASURES: Record<string, UnitMeasure> = {
  teaspoon: { dimension: 'volume', base: 4.92892 },
  tablespoon: { dimension: 'volume', base: 14.7868 },
  'fluid ounce': { dimension: 'volume', base: 29.5735 },
  cup: { dimension: 'volume', base: 236.588 },
  pint: { dimension: 'volume', base: 473.176 },
  quart: { dimension: 'volume', base: 946.353 },
  gallon: { dimension: 'volume', base: 3785.41 },
  milliliter: { dimension: 'volume', base: 1 },
  liter: { dimension: 'volume', base: 1000 },
  gram: { dimension: 'weight', base: 1 },
  kilogram: { dimension: 'weight', base: 1000 },
  ounce: { dimension: 'weight', base: 28.3495 },
  pound: { dimension: 'weight', base: 453.592 }
}

export function unitMeasure(unitName: string): UnitMeasure | null {
  return MEASURES[unitName] ?? null
}
