import {
  amountLabel,
  canonicalizeName,
  formatQuantity,
  pluralizeName,
  scaleFactor,
  unitMeasure,
  type UnitSchemas
} from '../base'
import type { GrocerySchemas } from './groceries'

type GroceryAmount = GrocerySchemas['GroceryAmount']
type GroceryLine = GrocerySchemas['GroceryLine']

export type ShoppableMeal = {
  id: string
  headcount: number | null
  dishes: {
    recipe: {
      name: string
      servings: number | null
      ingredients: {
        ingredient: { id: string; name: string }
        quantity: number | null
        unit: UnitSchemas['Unit'] | null
      }[]
    } | null
    customText: string | null
  }[]
}

export type LineDiff = {
  added: GroceryLine[]
  removed: GroceryLine[]
  changed: { before: GroceryLine; after: GroceryLine }[]
  increase: GroceryLine[]
}

function round(quantity: number): number {
  return Math.round(quantity * 1000) / 1000
}

type Unit = UnitSchemas['Unit']

const METRIC = new Set(['gram', 'milliliter'])

function measureOf(unit: Unit | null) {
  return unit === null ? null : unitMeasure(unit.name)
}

function amountKey(amount: GroceryAmount): string {
  const measure = measureOf(amount.unit)
  if (measure) return `measure:${measure.dimension}`
  if (amount.unit) return `unit:${amount.unit.id}`
  return amount.quantity === null ? 'none' : 'count'
}

function sumQuantities(a: number | null, b: number | null): number | null {
  if (a === null) return b
  if (b === null) return a
  return round(a + b)
}

function inUnit(amount: GroceryAmount, unit: Unit | null): number | null {
  if (amount.quantity === null || amount.unit?.id === unit?.id) return amount.quantity
  const from = measureOf(amount.unit)
  const to = measureOf(unit)
  if (from === null || to === null) return amount.quantity
  return (amount.quantity * from.base) / to.base
}

function isTidy(quantity: number, unit: Unit): boolean {
  if (METRIC.has(unit.name)) return true
  return quantity >= 0.25 - 1e-9 && Math.abs(quantity * 24 - Math.round(quantity * 24)) < 0.05
}

function combine(a: GroceryAmount, b: GroceryAmount): GroceryAmount {
  const measureA = measureOf(a.unit)
  const measureB = measureOf(b.unit)
  if (a.quantity === null || b.quantity === null || measureA === null || measureB === null || a.unit?.id === b.unit?.id) {
    return { unit: a.unit, quantity: sumQuantities(a.quantity, b.quantity) }
  }
  const total = a.quantity * measureA.base + b.quantity * measureB.base
  const [larger, smaller] = measureA.base >= measureB.base ? [a.unit, b.unit] : [b.unit, a.unit]
  const unit = larger && isTidy(total / (measureOf(larger)?.base ?? 1), larger) ? larger : smaller
  const quantity = total / (measureOf(unit)?.base ?? 1)
  return { unit, quantity: unit && METRIC.has(unit.name) && quantity >= 10 ? Math.round(quantity) : round(quantity) }
}

export function addAmounts(base: GroceryAmount[], extra: GroceryAmount[]): GroceryAmount[] {
  const result = [...base]
  for (const amount of extra) {
    const index = result.findIndex((existing) => amountKey(existing) === amountKey(amount))
    const existing = result[index]
    if (existing === undefined) result.push(amount)
    else result[index] = combine(existing, amount)
  }
  return result.filter((amount) => amountKey(amount) !== 'none')
}

export function textLineKey(text: string): string {
  return `text:${canonicalizeName(text)}`
}

export function mergeLines(lines: GroceryLine[]): GroceryLine[] {
  const merged = new Map<string, GroceryLine>()
  for (const line of lines) {
    const existing = merged.get(line.key)
    merged.set(
      line.key,
      existing === undefined
        ? {
            ...line,
            amounts: addAmounts([], line.amounts),
            dishes: [...new Set(line.dishes)],
            meals: [...new Set(line.meals)]
          }
        : {
            ...existing,
            amounts: addAmounts(existing.amounts, line.amounts),
            dishes: [...new Set([...existing.dishes, ...line.dishes])],
            meals: [...new Set([...existing.meals, ...line.meals])]
          }
    )
  }
  return [...merged.values()]
}

export function mealLines(meal: ShoppableMeal): GroceryLine[] {
  return mergeLines(
    meal.dishes.flatMap((dish): GroceryLine[] => {
      const recipe = dish.recipe
      if (recipe) {
        const factor = meal.headcount === null ? 1 : scaleFactor(recipe.servings, meal.headcount)
        return recipe.ingredients.map((line) => ({
          key: `ingredient:${line.ingredient.id}`,
          ingredientId: line.ingredient.id,
          name: line.ingredient.name,
          amounts: [{ quantity: line.quantity === null ? null : round(line.quantity * factor), unit: line.unit }],
          dishes: [recipe.name],
          meals: [meal.id]
        }))
      }
      const text = dish.customText?.trim()
      if (!text) return []
      return [{ key: textLineKey(text), ingredientId: null, name: text, amounts: [], dishes: [text], meals: [meal.id] }]
    })
  )
}

export function amountsText(amounts: GroceryAmount[]): string {
  return amounts
    .map((amount) => amountLabel(amount.quantity, amount.unit))
    .filter((label) => label !== '')
    .join(' + ')
}

export function lineText(line: Pick<GroceryLine, 'name' | 'amounts'>): string {
  const [only, ...others] = line.amounts
  if (only && others.length === 0 && only.unit === null && only.quantity !== null && only.quantity > 1) {
    return `${formatQuantity(only.quantity)} ${pluralizeName(line.name)}`
  }
  const amounts = amountsText(line.amounts)
  return amounts ? `${amounts} ${line.name}` : line.name
}

function sameAmounts(a: GroceryAmount[], b: GroceryAmount[]): boolean {
  if (a.length !== b.length) return false
  return a.every((amount) => {
    const other = b.find((candidate) => amountKey(candidate) === amountKey(amount))
    if (other === undefined) return false
    const converted = inUnit(other, amount.unit)
    if (amount.quantity === null || converted === null) return amount.quantity === converted
    return Math.abs(amount.quantity - converted) < 1e-3
  })
}

function amountIncrease(before: GroceryAmount[], after: GroceryAmount[]): GroceryAmount[] {
  return after.flatMap((amount) => {
    const previous = before.find((candidate) => amountKey(candidate) === amountKey(amount))
    if (previous === undefined) return [amount]
    const earlier = inUnit(previous, amount.unit)
    if (amount.quantity === null) return []
    if (earlier === null) return [amount]
    return amount.quantity - earlier > 1e-3 ? [{ unit: amount.unit, quantity: round(amount.quantity - earlier) }] : []
  })
}

export function diffLines(before: GroceryLine[], after: GroceryLine[]): LineDiff {
  const previous = new Map(before.map((line) => [line.key, line]))
  const current = new Set(after.map((line) => line.key))
  const diff: LineDiff = { added: [], removed: [], changed: [], increase: [] }
  for (const line of after) {
    const old = previous.get(line.key)
    if (old === undefined) {
      diff.added.push(line)
      diff.increase.push(line)
    } else if (!sameAmounts(old.amounts, line.amounts)) {
      diff.changed.push({ before: old, after: line })
      const amounts = amountIncrease(old.amounts, line.amounts)
      if (amounts.length > 0) diff.increase.push({ ...line, amounts })
    }
  }
  diff.removed = before.filter((line) => !current.has(line.key))
  return diff
}

export function hasChanges(diff: LineDiff): boolean {
  return diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0
}

export type ListedItem = { id: string; text: string; checked: boolean; line: GroceryLine | null }

export type ImportPlan = {
  updates: { id: string; text: string; line: GroceryLine }[]
  inserts: { text: string; line: GroceryLine }[]
}

export function findListedItem<T extends ListedItem>(items: T[], line: GroceryLine): T | undefined {
  const open = items.filter((item) => !item.checked)
  return (
    open.find((item) => item.line?.key === line.key) ??
    open.find((item) => item.line === null && canonicalizeName(item.text) === canonicalizeName(line.name))
  )
}

export function planImport(items: ListedItem[], lines: GroceryLine[]): ImportPlan {
  const plan: ImportPlan = { updates: [], inserts: [] }
  const current = [...items]
  for (const line of lines) {
    const listed = findListedItem(current, line)
    if (listed === undefined) {
      plan.inserts.push({ text: lineText(line), line })
      continue
    }
    if (listed.line === null && line.ingredientId === null) continue
    const merged: GroceryLine =
      listed.line === null
        ? line
        : {
            ...listed.line,
            amounts: addAmounts(listed.line.amounts, line.amounts),
            dishes: [...new Set([...listed.line.dishes, ...line.dishes])],
            meals: [...new Set([...(listed.line.meals ?? []), ...line.meals])]
          }
    const update = { id: listed.id, text: lineText(merged), line: merged }
    plan.updates = [...plan.updates.filter((existing) => existing.id !== listed.id), update]
    current.splice(current.indexOf(listed), 1, { ...listed, ...update })
  }
  return plan
}
