import { CookedMealSchemas, PlannedMealSchemas } from '@rotisserie/shared/meals'
import { IngredientSchemas, TagSchemas, UnitSchemas } from '@rotisserie/shared/base'
import { RecipeSchemas } from '@rotisserie/shared/recipes'
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import z from 'zod'
import { api } from './client'

export type PlannedMeal = PlannedMealSchemas['PlannedMeal']
export type PlannedMealInput = z.input<typeof PlannedMealSchemas.PlannedMealInput>
export type CookedMeal = CookedMealSchemas['CookedMeal']
export type CookedMealInput = z.input<typeof CookedMealSchemas.CookedMealInput>
export type Recipe = RecipeSchemas['RecipeWithStats']
export type RecipeInput = z.input<typeof RecipeSchemas.UpsertRecipeInput>
export type RecipeSort = RecipeSchemas['RecipeSort']
export type RecipeListItem = RecipeSchemas['RecipeWithStatsPage']['recipes'][number]

const MealsInRange = z.object({
  planned: PlannedMealSchemas.PlannedMeal.array(),
  cooked: CookedMealSchemas.CookedMeal.array()
})

export const keys = {
  meals: ['meals'] as const,
  mealsInRange: (from: string, to: string) => ['meals', from, to] as const,
  unscheduled: ['planned', 'unscheduled'] as const,
  planned: (id: string) => ['planned', id] as const,
  cooked: (id: string) => ['cooked', id] as const,
  recipes: ['recipes'] as const,
  recipeSearch: (q: string) => ['recipes', 'search', q] as const,
  recipeList: (q: string, tag: string, sort: RecipeSort) => ['recipes', 'list', q, tag, sort] as const,
  recipe: (id: string) => ['recipes', id] as const,
  tags: ['tags'] as const,
  units: ['units'] as const,
  ingredients: (q: string) => ['ingredients', q] as const
}

export function useMealsInRange(from: string, to: string) {
  return useQuery({
    queryKey: keys.mealsInRange(from, to),
    queryFn: () => api.get(MealsInRange, '/meals', { from, to }),
    placeholderData: keepPreviousData
  })
}

export function useUnscheduledPlannedMeals() {
  return useQuery({
    queryKey: keys.unscheduled,
    queryFn: () => api.get(PlannedMealSchemas.PlannedMeal.array(), '/planned-meals/unscheduled')
  })
}

export function usePlannedMeal(id: string | undefined) {
  return useQuery({
    queryKey: keys.planned(id ?? ''),
    queryFn: () => api.get(PlannedMealSchemas.PlannedMeal, `/planned-meals/${id}`),
    enabled: id !== undefined
  })
}

export function useCookedMeal(id: string | undefined) {
  return useQuery({
    queryKey: keys.cooked(id ?? ''),
    queryFn: () => api.get(CookedMealSchemas.CookedMeal, `/cooked-meals/${id}`),
    enabled: id !== undefined
  })
}

export function useRecipe(id: string | undefined) {
  return useQuery({
    queryKey: keys.recipe(id ?? ''),
    queryFn: () => api.get(RecipeSchemas.RecipeWithStats, `/recipes/${id}`),
    enabled: id !== undefined
  })
}

export function useRecipeSearch(q: string) {
  return useQuery({
    queryKey: keys.recipeSearch(q),
    queryFn: () => api.get(RecipeSchemas.RecipeWithStatsPage, '/recipes', { q, limit: 5 }),
    enabled: q.length > 0,
    placeholderData: keepPreviousData
  })
}

export function useRecipeList({ q, tag, sort }: { q: string; tag: string; sort: RecipeSort }) {
  return useInfiniteQuery({
    queryKey: keys.recipeList(q, tag, sort),
    queryFn: ({ pageParam }) =>
      api.get(RecipeSchemas.RecipeWithStatsPage, '/recipes', {
        q: q || undefined,
        tag: tag || undefined,
        sort,
        limit: 30,
        cursor: pageParam
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    placeholderData: keepPreviousData
  })
}

export function useUnits() {
  return useQuery({
    queryKey: keys.units,
    queryFn: () => api.get(UnitSchemas.Unit.array(), '/units'),
    staleTime: Infinity
  })
}

export function useIngredientSearch(q: string) {
  return useQuery({
    queryKey: keys.ingredients(q),
    queryFn: () => api.get(IngredientSchemas.Ingredient.array(), '/ingredients', { q, limit: 6 }),
    enabled: q.length >= 2,
    placeholderData: keepPreviousData
  })
}

export function useDeleteRecipe() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/recipes/${id}`),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.recipes }),
        queryClient.invalidateQueries({ queryKey: keys.meals }),
        queryClient.invalidateQueries({ queryKey: ['planned'] })
      ])
  })
}

export function useTags() {
  return useQuery({
    queryKey: keys.tags,
    queryFn: () => api.get(TagSchemas.Tag.array(), '/tags')
  })
}

export function useInvalidateMeals() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.meals }),
      queryClient.invalidateQueries({ queryKey: ['planned'] }),
      queryClient.invalidateQueries({ queryKey: ['cooked'] }),
      queryClient.invalidateQueries({ queryKey: keys.recipes })
    ])
}

export function useSettle() {
  const invalidate = useInvalidateMeals()
  return useMutation({
    mutationFn: (before: string) => api.post(CookedMealSchemas.CookedMeal.array(), '/cooked-meals/settle', { before }),
    onSuccess: (settled) => (settled.length > 0 ? invalidate() : undefined)
  })
}

export function useUpsertPlannedMeal() {
  const invalidate = useInvalidateMeals()
  return useMutation({
    mutationFn: ({ id, ...body }: PlannedMealInput) => api.put(PlannedMealSchemas.PlannedMeal, `/planned-meals/${id}`, body),
    onSuccess: invalidate
  })
}

export function useDeletePlannedMeal() {
  const invalidate = useInvalidateMeals()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/planned-meals/${id}`),
    onSuccess: invalidate
  })
}

export function useUpsertCookedMeal() {
  const invalidate = useInvalidateMeals()
  return useMutation({
    mutationFn: ({ id, ...body }: CookedMealInput) => api.put(CookedMealSchemas.CookedMeal, `/cooked-meals/${id}`, body),
    onSuccess: invalidate
  })
}

export function useDeleteCookedMeal() {
  const invalidate = useInvalidateMeals()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/cooked-meals/${id}`),
    onSuccess: invalidate
  })
}

export function useUpsertRecipe() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: RecipeInput) => api.put(RecipeSchemas.Recipe, `/recipes/${id}`, body),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.recipes }),
        queryClient.invalidateQueries({ queryKey: keys.tags }),
        queryClient.invalidateQueries({ queryKey: keys.meals })
      ])
  })
}
