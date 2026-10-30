export type ImportedRecipe = {
  name: string | null
  ingredients: string[]
  steps: string[]
  prepTimeMinutes: number | null
  cookTimeMinutes: number | null
  totalTimeMinutes: number | null
  servings: number | null
}

const MAX_INGREDIENTS = 200
const MAX_STEPS = 200
const ATTR = '[^>]{0,2000}'
const BLOCK_TAGS = 'br|p|div|li|tr|section|article|ul|ol|table|h1|h2|h3|h4|h5|h6|blockquote'
const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr'
])
const WRAPPER_KEYS = ['@value', 'value', 'text', 'name'] as const

const NAMED_ENTITIES = new Map(
  Object.entries({
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    hellip: '…',
    mdash: '—',
    ndash: '–',
    lsquo: '‘',
    rsquo: '’',
    ldquo: '“',
    rdquo: '”',
    deg: '°',
    frac12: '½',
    frac13: '⅓',
    frac14: '¼',
    frac23: '⅔',
    frac34: '¾'
  })
)

function decodeEntities(text: string): string {
  return text.replace(/&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole: string, body: string) => {
    if (body.startsWith('#')) {
      const hex = body[1] === 'x' || body[1] === 'X'
      const code = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10)
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return whole
      try {
        return String.fromCodePoint(code)
      } catch {
        return whole
      }
    }
    return NAMED_ENTITIES.get(body.toLowerCase()) ?? whole
  })
}

function stripScriptStyle(html: string): string {
  const lower = html.toLowerCase()
  let out = ''
  let cursor = 0
  for (;;) {
    let start = -1
    let closing = ''
    for (const [open, close] of [
      ['<script', '</script'],
      ['<style', '</style']
    ] as const) {
      const at = lower.indexOf(open, cursor)
      if (at !== -1 && (start === -1 || at < start)) {
        start = at
        closing = close
      }
    }
    if (start === -1) return out + html.slice(cursor)
    out += html.slice(cursor, start)
    const openEnd = html.indexOf('>', start)
    if (openEnd === -1) return out
    const closeStart = lower.indexOf(closing, openEnd)
    if (closeStart === -1) return out
    const closeEnd = html.indexOf('>', closeStart)
    if (closeEnd === -1) return out
    out += ' '
    cursor = closeEnd + 1
  }
}

function stripHtml(html: string): string {
  if (!html) return ''
  const text = stripScriptStyle(html)
  const lastGt = text.lastIndexOf('>')
  const head = lastGt === -1 ? '' : text.slice(0, lastGt + 1)
  const tail = lastGt === -1 ? text : text.slice(lastGt + 1)
  const stripped = head
    .replace(/<!--[\s\S]{0,50000}?-->/g, ' ')
    .replace(new RegExp(`<\\s*(?:${BLOCK_TAGS})\\b${ATTR}>`, 'gi'), '\n')
    .replace(new RegExp(`<\\s*/\\s*(?:${BLOCK_TAGS})\\s*>`, 'gi'), '\n')
    .replace(new RegExp(`<${ATTR}>`, 'g'), '')
  const dangling = tail.indexOf('<')
  return decodeEntities(stripped + (dangling === -1 ? tail : tail.slice(0, dangling)))
    .replace(/[^\S\n]+/g, ' ')
    .replace(/[^\S\n]*\n[^\S\n]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function stripHtmlInline(html: string): string {
  return stripHtml(html).replace(/\s+/g, ' ').trim()
}

function nonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function firstString(value: unknown, depth = 0): string | null {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (depth >= 5) return null
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = firstString(entry, depth + 1)
      if (found !== null) return found
    }
    return null
  }
  if (isRecord(value)) {
    for (const key of WRAPPER_KEYS) {
      if (key in value) {
        const found = firstString(value[key], depth + 1)
        if (found !== null) return found
      }
    }
  }
  return null
}

function toStringArray(value: unknown, depth = 0): string[] {
  if (depth >= 5) return []
  if (typeof value === 'string') return [value]
  if (typeof value === 'number' && Number.isFinite(value)) return [String(value)]
  if (Array.isArray(value)) return value.flatMap((entry) => toStringArray(entry, depth + 1))
  if (isRecord(value)) {
    const found = firstString(value, depth + 1)
    return found === null ? [] : [found]
  }
  return []
}

type Tag = { tag: string; attrs: string; closing: boolean; selfClosing: boolean; start: number; end: number }

function* eachTag(html: string, from = 0): Generator<Tag> {
  let cursor = from
  for (;;) {
    const lt = html.indexOf('<', cursor)
    if (lt === -1) return
    const gt = html.indexOf('>', lt + 1)
    if (gt === -1) return
    cursor = gt + 1
    const raw = html.slice(lt + 1, gt)
    const name = /^(\/?)\s*([a-z][a-z0-9-]*)/i.exec(raw)
    if (!name) continue
    yield {
      tag: (name[2] ?? '').toLowerCase(),
      attrs: raw.slice(name[0].length),
      closing: name[1] === '/',
      selfClosing: /\/\s*$/.test(raw),
      start: lt,
      end: gt + 1
    }
  }
}

function readAttribute(attrs: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(attrs)
  if (!match) return null
  return match[1] ?? match[2] ?? match[3] ?? null
}

function findElementEnd(html: string, tag: string, contentStart: number): number {
  let depth = 1
  for (const found of eachTag(html, contentStart)) {
    if (found.tag !== tag) continue
    if (found.closing) {
      depth -= 1
      if (depth === 0) return found.start
    } else if (!found.selfClosing) {
      depth += 1
    }
  }
  return html.length
}

const JSON_LD_TYPE = /(^|\s)type\s*=\s*["']?application\/ld\+json["']?/i

function* jsonLdBlocks(html: string): Generator<string> {
  const lower = html.toLowerCase()
  for (const tag of eachTag(html)) {
    if (tag.closing || tag.tag !== 'script' || !JSON_LD_TYPE.test(tag.attrs)) continue
    const close = lower.indexOf('</script', tag.end)
    if (close === -1) return
    yield unwrapScriptBody(html.slice(tag.end, close))
  }
}

function unwrapScriptBody(raw: string): string {
  return raw
    .replace(/\/\*\s*<!\[CDATA\[\s*\*\//g, '')
    .replace(/\/\*\s*\]\]>\s*\*\//g, '')
    .replace(/\/\/\s*<!\[CDATA\[/g, '')
    .replace(/\/\/\s*\]\]>/g, '')
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/^\s*<!--/, '')
    .replace(/-->\s*$/, '')
    .trim()
}

function isRecipeType(type: unknown): boolean {
  if (typeof type === 'string') {
    const bare = type.split(/[/#:]/).pop() ?? type
    return bare.trim().toLowerCase() === 'recipe'
  }
  if (Array.isArray(type)) return type.some(isRecipeType)
  return false
}

function findRecipeNode(value: unknown, seen: Set<object>, depth = 0): Record<string, unknown> | null {
  if (depth >= 8 || value === null || typeof value !== 'object' || seen.has(value)) return null
  seen.add(value)
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findRecipeNode(entry, seen, depth + 1)
      if (found) return found
    }
    return null
  }
  const node = value as Record<string, unknown>
  if (isRecipeType(node['@type'])) return node
  for (const nested of Object.values(node)) {
    if (nested !== null && typeof nested === 'object') {
      const found = findRecipeNode(nested, seen, depth + 1)
      if (found) return found
    }
  }
  return null
}

function extractJsonLdRecipe(html: string): Record<string, unknown> | null {
  for (const body of jsonLdBlocks(html)) {
    if (!body) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(body)
    } catch {
      continue
    }
    const recipe = findRecipeNode(parsed, new Set())
    if (recipe) return recipe
  }
  return null
}

const RECIPE_ITEMTYPE = /\bitemtype\s*=\s*["'][^"']*schema\.org\/Recipe[^"']*["']/i

type MicrodataElement = { tag: string; attrs: string; inner: string }

function extractRecipeScope(html: string): string | null {
  for (const found of eachTag(html)) {
    if (found.closing || !RECIPE_ITEMTYPE.test(found.attrs)) continue
    if (VOID_TAGS.has(found.tag)) return null
    return html.slice(found.end, findElementEnd(html, found.tag, found.end))
  }
  return null
}

function nestedScopeRanges(scope: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  for (const found of eachTag(scope)) {
    if (found.closing || VOID_TAGS.has(found.tag) || !/\bitemscope\b/i.test(found.attrs)) continue
    ranges.push([found.start, findElementEnd(scope, found.tag, found.end)])
  }
  return ranges
}

function withinAny(index: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([start, end]) => index >= start && index < end)
}

function findItemprops(scope: string, prop: string, nested: Array<[number, number]>): MicrodataElement[] {
  const wanted = new RegExp(`\\bitemprop\\s*=\\s*["'][^"']*\\b${prop}\\b[^"']*["']`, 'i')
  const found: MicrodataElement[] = []
  for (const element of eachTag(scope)) {
    if (element.closing || !wanted.test(element.attrs) || withinAny(element.start, nested)) continue
    const inner = VOID_TAGS.has(element.tag) ? '' : scope.slice(element.end, findElementEnd(scope, element.tag, element.end))
    found.push({ tag: element.tag, attrs: element.attrs, inner })
    if (found.length >= MAX_INGREDIENTS) break
  }
  return found
}

function microdataValue(element: MicrodataElement): string | null {
  const { tag, attrs, inner } = element
  if (tag === 'meta') return nonEmpty(readAttribute(attrs, 'content'))
  if (tag === 'link') return nonEmpty(readAttribute(attrs, 'href'))
  if (tag === 'time') return nonEmpty(readAttribute(attrs, 'datetime')) ?? nonEmpty(stripHtmlInline(inner))
  return nonEmpty(stripHtmlInline(inner)) ?? nonEmpty(readAttribute(attrs, 'content'))
}

function listItems(html: string): string[] {
  const items: string[] = []
  for (const item of html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li\s*>/gi)) {
    const text = nonEmpty(stripHtmlInline(item[1] ?? ''))
    if (text !== null) items.push(text)
  }
  return items
}

function extractMicrodataRecipe(html: string): Record<string, unknown> | null {
  const scope = extractRecipeScope(html)
  if (scope === null) return null
  const nested = nestedScopeRanges(scope)
  const single = (prop: string): string | null => {
    for (const element of findItemprops(scope, prop, nested)) {
      const value = microdataValue(element)
      if (value !== null) return value
    }
    return null
  }
  const many = (prop: string): string[] =>
    findItemprops(scope, prop, nested)
      .map(microdataValue)
      .filter((value): value is string => value !== null)

  const node: Record<string, unknown> = {}
  const name = single('name')
  if (name !== null) node.name = name
  for (const prop of ['prepTime', 'cookTime', 'totalTime'] as const) {
    const value = single(prop)
    if (value !== null) node[prop] = value
  }
  const recipeYield = single('recipeYield') ?? single('yield')
  if (recipeYield !== null) node.recipeYield = recipeYield
  const ingredients = [...many('recipeIngredient'), ...many('ingredients')]
  if (ingredients.length > 0) node.recipeIngredient = ingredients

  const instructionElements = findItemprops(scope, 'recipeInstructions', nested)
  const first = instructionElements[0]
  const fromList = instructionElements.length === 1 && first && /<li\b/i.test(first.inner) ? listItems(first.inner) : []
  const steps = fromList.length > 0 ? fromList : instructionElements.map(microdataValue).filter((value) => value !== null)
  if (steps.length > 0) node.recipeInstructions = steps

  return Object.keys(node).length > 0 ? node : null
}

function collectInstructionSteps(value: unknown, depth = 0, out: string[] = []): string[] {
  if (depth >= 6 || value === null || value === undefined) return out
  if (typeof value === 'string') {
    if (/<li\b/i.test(value)) {
      const items = listItems(value)
      if (items.length > 0) {
        out.push(...items)
        return out
      }
    }
    const text = nonEmpty(stripHtml(value))
    if (text !== null) out.push(text)
    return out
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectInstructionSteps(entry, depth + 1, out)
    return out
  }
  if (isRecord(value)) {
    const type = typeof value['@type'] === 'string' ? value['@type'].toLowerCase() : ''
    const isSection = type.includes('howtosection') || type.includes('itemlist')
    if (!isSection) {
      const text = firstString(value['text']) ?? firstString(value['name'])
      const cleaned = nonEmpty(stripHtml(text ?? ''))
      if (cleaned !== null) {
        out.push(cleaned)
        return out
      }
    }
    if (value['itemListElement'] !== undefined) {
      collectInstructionSteps(value['itemListElement'], depth + 1, out)
      return out
    }
    const fallback = nonEmpty(stripHtml(firstString(value) ?? ''))
    if (fallback !== null) out.push(fallback)
  }
  return out
}

function splitNumbered(text: string): string[] {
  const cuts: number[] = []
  let expected = 1
  for (const match of text.matchAll(/(^|\s)(\d{1,3})[.)]\s+/g)) {
    const number = Number(match[2])
    if (number !== expected && number !== expected - 1) continue
    cuts.push((match.index ?? 0) + (match[1] ?? '').length)
    if (number === expected) expected += 1
  }
  if (cuts.length < 2) return [text]
  const pieces = cuts.map((cut, index) =>
    text
      .slice(cut, cuts[index + 1])
      .replace(/^\d{1,3}[.)]\s+/, '')
      .trim()
  )
  const lead = text.slice(0, cuts[0]).trim()
  return [...(lead ? [lead] : []), ...pieces].filter(Boolean)
}

function normalizeSteps(steps: string[]): string[] {
  const only = steps.length === 1 ? steps[0] : undefined
  const split = only === undefined ? steps : splitNumbered(only)
  const lines = split.length === 1 && only !== undefined ? only.split(/\n+/) : split
  return lines.map((step) => step.replace(/\s+/g, ' ').trim()).filter(Boolean)
}

const ISO_DURATION =
  /^P(?:(\d+(?:[.,]\d+)?)Y)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)W)?(?:(\d+(?:[.,]\d+)?)D)?(?:T(?:(\d+(?:[.,]\d+)?)H)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)S)?)?$/i
const TEXT_DURATION_PART = /(\d+(?:\s+\d+\/\d+|\/\d+|[.,]\d+)?)\s*([a-z]+)/gi
const HOURS_MINUTES = /^(\d+)\s*h\s*(\d{1,2})$/i

function toNumber(text: string | undefined): number {
  if (!text) return 0
  return text
    .replace(',', '.')
    .split(/\s+/)
    .reduce((sum, part) => {
      const [numerator, denominator] = part.split('/').map(Number)
      return sum + (denominator ? (numerator ?? 0) / denominator : (numerator ?? 0))
    }, 0)
}

function unitMinutes(unit: string): number | null {
  const name = unit.toLowerCase()
  if (/^(h|hr|hrs|hour|hours)$/.test(name)) return 60
  if (/^(m|min|mins|minute|minutes)$/.test(name)) return 1
  if (/^(s|sec|secs|second|seconds)$/.test(name)) return 1 / 60
  return null
}

function wholeMinutes(total: number): number | null {
  const rounded = Math.round(total)
  return rounded > 0 ? rounded : null
}

export function parseDuration(text: string): number | null {
  const value = text.trim()
  if (!value) return null
  const iso = ISO_DURATION.exec(value)
  if (iso) {
    const [, years, months, weeks, days, hours, minutes, seconds] = iso
    if (![years, months, weeks, days, hours, minutes, seconds].some(Boolean)) return null
    return wholeMinutes(
      toNumber(years) * 365 * 1440 +
        toNumber(months) * 30 * 1440 +
        toNumber(weeks) * 7 * 1440 +
        toNumber(days) * 1440 +
        toNumber(hours) * 60 +
        toNumber(minutes) +
        toNumber(seconds) / 60
    )
  }
  const compact = HOURS_MINUTES.exec(value)
  if (compact) return wholeMinutes(Number(compact[1]) * 60 + Number(compact[2]))
  let total = 0
  let found = false
  for (const match of value.matchAll(TEXT_DURATION_PART)) {
    const factor = unitMinutes(match[2] ?? '')
    if (factor === null) continue
    total += toNumber(match[1]) * factor
    found = true
  }
  return found ? wholeMinutes(total) : null
}

function durationMinutes(value: unknown): number | null {
  const raw = firstString(value)
  return raw === null ? null : parseDuration(raw)
}

function parseServings(value: unknown): number | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const servings = parseServings(entry)
      if (servings !== null) return servings
    }
    return null
  }
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? Math.trunc(value) : null
  const text = firstString(value)
  if (text === null) return null
  const match = /\d+/.exec(stripHtmlInline(text))
  if (!match) return null
  const servings = Number.parseInt(match[0], 10)
  return Number.isFinite(servings) && servings > 0 ? servings : null
}

function toImportedRecipe(node: Record<string, unknown>): ImportedRecipe {
  return {
    name: nonEmpty(stripHtmlInline(firstString(node['name']) ?? '')),
    ingredients: toStringArray(node['recipeIngredient'] ?? node['ingredients'])
      .map(stripHtmlInline)
      .filter((line) => line !== '' && !line.endsWith(':'))
      .slice(0, MAX_INGREDIENTS),
    steps: normalizeSteps(collectInstructionSteps(node['recipeInstructions'])).slice(0, MAX_STEPS),
    prepTimeMinutes: durationMinutes(node['prepTime']),
    cookTimeMinutes: durationMinutes(node['cookTime']),
    totalTimeMinutes: durationMinutes(node['totalTime']),
    servings: parseServings(node['recipeYield'] ?? node['yield'])
  }
}

function hasBody(recipe: ImportedRecipe): boolean {
  return recipe.ingredients.length > 0 || recipe.steps.length > 0
}

export function extractRecipe(html: string): ImportedRecipe | null {
  const fromJsonLd = extractJsonLdRecipe(html)
  const structured = fromJsonLd ? toImportedRecipe(fromJsonLd) : null
  if (structured && hasBody(structured)) return structured
  const fromMicrodata = extractMicrodataRecipe(html)
  const marked = fromMicrodata ? toImportedRecipe(fromMicrodata) : null
  if (marked && hasBody(marked)) return marked
  if (structured?.name) return structured
  return marked?.name ? marked : null
}
