import { canonicalizeName, canonicalizeUnit } from '@rotisserie/shared/base'

const VULGAR: Record<string, number> = {
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
const GLYPHS: [number, string][] = Object.entries(VULGAR).map(([glyph, value]) => [value, glyph])

export function formatQuantity(value: number): string {
  const whole = Math.floor(value + 1e-9)
  const fraction = value - whole
  if (fraction < 0.02) return String(whole)
  if (fraction > 0.98) return String(whole + 1)
  const glyph = GLYPHS.find(([part]) => Math.abs(part - fraction) < 0.02)?.[1]
  if (glyph) return whole > 0 ? `${whole}${glyph}` : glyph
  return String(Math.round(value * 100) / 100)
}

const IRREGULAR_PLURALS: Record<string, string> = { leaf: 'leaves', 'fluid ounce': 'fluid ounces' }

export function pluralize(word: string): string {
  if (IRREGULAR_PLURALS[word]) return IRREGULAR_PLURALS[word]
  if (/(s|sh|ch|x|z)$/.test(word)) return `${word}es`
  return `${word}s`
}

export function unitLabel(unit: { name: string; abbreviation: string | null }, quantity: number | null): string {
  if (unit.abbreviation && unit.abbreviation !== unit.name) return unit.abbreviation
  return quantity !== null && quantity > 1 ? pluralize(unit.name) : unit.name
}

export function amountLabel(quantity: number | null, unit: { name: string; abbreviation: string | null } | null): string {
  const parts = [quantity === null ? null : formatQuantity(quantity), unit ? unitLabel(unit, quantity) : null]
  return parts.filter((part) => part !== null).join(' ')
}

export function scaleFactor(servings: number | null, people: number): number {
  return servings && servings > 0 ? people / servings : 1
}

const NUMBER = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d*\.\d+|\d+)`
const QUANTITY = new RegExp(
  String.raw`^(${NUMBER})?\s*([${Object.keys(VULGAR).join('')}])?(?:\s*(?:-|–|to)\s*${NUMBER})?\s*`
)

function parseNumber(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .reduce((sum, part) => {
      const [numerator, denominator] = part.split('/').map(Number)
      return sum + (denominator ? (numerator ?? 0) / denominator : (numerator ?? 0))
    }, 0)
}

export type ParsedIngredient = { quantity: number | null; unit: string | null; name: string; notes: string | null }

const PRICE = /^[$£€]\s?\d+(?:[.,]\d+)?$/
const SIZE_BEFORE_CONTAINER =
  /^(\d+(?:[.,]\d+)?\s*-?\s*(?:fl\.?\s*oz|oz|ounces?|g|grams?|kg|ml|l|lbs?|pounds?)\.?)\s+(?=(?:cans?|jars?|packages?|pkgs?|bags?|box(?:es)?|bottles?|containers?|cartons?|tins?|packets?|blocks?|sticks?)\b)/i
const PREP_WORDS =
  'chopped|diced|minced|grated|sliced|crushed|peeled|halved|quartered|cubed|shredded|softened|beaten|torn|trimmed|rinsed|drained|crumbled|toasted|juiced|zested|melted|mashed|sifted|chilled|cooled|cored|seeded|pitted|deveined|divided|cut'
const TRAILING_PREP = new RegExp(
  String.raw`^(.*?\S)\s+((?:(?:very\s+)?(?:finely|roughly|thinly|thickly|coarsely|freshly|lightly)\s+)?(?:${PREP_WORDS})(?:\s+(?:into|in)\s+.+)?|to taste|for serving|for garnish|optional)$`,
  'i'
)

function firstTopLevelComma(text: string): number {
  let depth = 0
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (char === '(') depth += 1
    else if (char === ')') depth = Math.max(0, depth - 1)
    else if (char === ',' && depth === 0) return index
  }
  return -1
}

function liftParentheses(line: string): { bare: string; asides: string[] } {
  const asides: string[] = []
  let text = line
  for (let pass = 0; pass < 6 && text.includes('('); pass++) {
    const comma = firstTopLevelComma(text)
    const next = text.replace(/\(([^()]*)\)/g, (_, inside: string, offset: number) => {
      const note = inside.replace(/^[\s,;:]+|[\s,;:]+$/g, '')
      if (!note || PRICE.test(note)) return ' '
      if (comma !== -1 && offset > comma) return `, ${note},`
      asides.push(note)
      return ' '
    })
    if (next === text) break
    text = next
  }
  const bare = text
    .replace(/\*+/g, '')
    .replace(/\s*,(?:\s*,)*\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/^[,\s]+|[,\s]+$/g, '')
  return { bare, asides }
}

export function parseIngredientLine(line: string, knownUnits: string[]): ParsedIngredient {
  const units = new Set(knownUnits)
  const { bare, asides } = liftParentheses(line.replace(/^[-•*]\s*/, ''))
  const commaAt = bare.indexOf(',')
  const main = (commaAt === -1 ? bare : bare.slice(0, commaAt)).trim()
  const afterComma = commaAt === -1 ? '' : bare.slice(commaAt + 1).trim()

  const match = QUANTITY.exec(main)
  const numberText = match?.[1]
  const glyph = match?.[2]
  const hasQuantity = numberText !== undefined || glyph !== undefined
  const quantity = hasQuantity ? (numberText ? parseNumber(numberText) : 0) + (glyph ? (VULGAR[glyph] ?? 0) : 0) : null
  let rest = hasQuantity ? main.slice(match?.[0].length ?? 0) : main

  const size = hasQuantity ? SIZE_BEFORE_CONTAINER.exec(rest) : null
  if (size) {
    asides.unshift(size[1] ?? '')
    rest = rest.slice(size[0].length)
  }

  let unit: string | null = null
  const words = rest.split(/\s+/).filter(Boolean)
  for (const take of [2, 1]) {
    if (words.length <= take) continue
    const candidate = canonicalizeUnit(words.slice(0, take).join(' '))
    if (units.has(candidate)) {
      unit = candidate
      rest = words.slice(take).join(' ')
      break
    }
  }

  const prep = TRAILING_PREP.exec(rest)
  if (prep) rest = prep[1] ?? rest
  const name = canonicalizeName(rest.replace(/^of\s+/i, ''))
  const notes = [prep?.[2], ...asides, afterComma].filter((note) => note?.trim()).join(', ') || null
  return { quantity: quantity && quantity > 0 ? quantity : null, unit, name, notes }
}

export function formatIngredientLine(ingredient: ParsedIngredient): string {
  const amount = [ingredient.quantity === null ? null : formatQuantity(ingredient.quantity), ingredient.unit]
    .filter((part) => part !== null)
    .join(' ')
  return [amount, ingredient.name].filter(Boolean).join(' ') + (ingredient.notes ? `, ${ingredient.notes}` : '')
}
