import type { Recipe, RecipeInput } from '~/api/queries'
import { shortDate } from './dates'

export function recipeToInput(recipe: Recipe, changes: Partial<RecipeInput> = {}): RecipeInput {
  return {
    id: recipe.id,
    name: recipe.name,
    instructions: recipe.instructions ?? '',
    prepTimeMinutes: recipe.prepTimeMinutes,
    cookTimeMinutes: recipe.cookTimeMinutes,
    servings: recipe.servings,
    sourceUrl: recipe.sourceUrl,
    notes: recipe.notes,
    ingredients: recipe.ingredients.map((line) => ({
      name: line.ingredient.name,
      quantity: line.quantity,
      unit: line.unit?.name ?? null,
      notes: line.notes
    })),
    tags: recipe.tags.map((tag) => tag.name),
    ...changes
  }
}

export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest} min`
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`
}

export function timesLabel(recipe: { prepTimeMinutes: number | null; cookTimeMinutes: number | null }): string | null {
  const parts = [
    recipe.prepTimeMinutes ? `Prep ${formatMinutes(recipe.prepTimeMinutes)}` : null,
    recipe.cookTimeMinutes ? `Cook ${formatMinutes(recipe.cookTimeMinutes)}` : null
  ].filter((part) => part !== null)
  return parts.length > 0 ? parts.join(' · ') : null
}

export function totalMinutes(recipe: { prepTimeMinutes: number | null; cookTimeMinutes: number | null }): number {
  return (recipe.prepTimeMinutes ?? 0) + (recipe.cookTimeMinutes ?? 0)
}

type Stats = { averageRating: number | null; ratingCount: number; timesMade: number; lastMadeOn: string | null }

export function madeLabel(stats: Stats): string {
  if (stats.timesMade === 0) return 'Never made'
  const times = stats.timesMade === 1 ? 'made once' : `made ${stats.timesMade} times`
  return stats.lastMadeOn ? `${times} · last ${shortDate(stats.lastMadeOn)}` : times
}

export function ratingLabel(stats: Stats): string | null {
  if (stats.averageRating === null) return null
  return stats.averageRating.toFixed(1)
}

export function instructionSteps(instructions: string | null): string[] {
  return (instructions ?? '')
    .split('\n')
    .map((line) => line.trim().replace(/^\d+[.)]\s*/, ''))
    .filter(Boolean)
}

export function hostname(url: string): string {
  return (
    url
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0] ?? url
  )
}
