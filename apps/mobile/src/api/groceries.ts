import { GrocerySchemas } from '@rotisserie/shared/groceries'
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type z from 'zod'
import { api } from './client'

export type GroceryList = GrocerySchemas['GroceryList']
export type GroceryItem = GrocerySchemas['GroceryItem']
export type GroceryAlert = GrocerySchemas['GroceryAlert']
export type GroceryItemInput = z.input<typeof GrocerySchemas.GroceryItemInput>
export type PreviewLine = GrocerySchemas['PreviewLine']
export type GroceryStore = GrocerySchemas['GroceryStore']
export type GroceryStoreInput = GrocerySchemas['GroceryStoreInput']

const groceryKey = ['grocery-list'] as const

function sortItems(items: GroceryItem[]): GroceryItem[] {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt))
}

export function useGroceryList({ live }: { live: boolean }) {
  const mutating = useIsMutating({ mutationKey: groceryKey })
  return useQuery({
    queryKey: groceryKey,
    queryFn: () => api.get(GrocerySchemas.GroceryList, '/grocery-list'),
    refetchInterval: live && mutating === 0 ? 15_000 : false
  })
}

function useOptimisticList() {
  const queryClient = useQueryClient()
  return {
    update(change: (list: GroceryList) => GroceryList) {
      queryClient.setQueryData<GroceryList>(groceryKey, (list) => (list ? change(list) : list))
    },
    replace(list: GroceryList) {
      queryClient.setQueryData<GroceryList>(groceryKey, list)
    },
    settle() {
      if (queryClient.isMutating({ mutationKey: groceryKey }) <= 1) {
        return queryClient.invalidateQueries({ queryKey: groceryKey })
      }
    }
  }
}

export function useSaveGroceryItem() {
  const list = useOptimisticList()
  return useMutation({
    mutationKey: groceryKey,
    mutationFn: ({ id, ...body }: GroceryItemInput) =>
      api.put(GrocerySchemas.GroceryItem, `/grocery-list/items/${id}`, body),
    onMutate: (input) =>
      list.update((current) => {
        const now = new Date().toISOString()
        const existing = current.items.find((item) => item.id === input.id)
        const item: GroceryItem = {
          id: input.id,
          text: input.text.trim(),
          checked: input.checked ?? false,
          sortOrder: input.sortOrder,
          storeId: input.storeId === undefined ? (existing?.storeId ?? null) : input.storeId,
          section: input.section === undefined ? (existing?.section ?? null) : input.section,
          dishes: existing?.dishes ?? [],
          mealIds: existing?.mealIds ?? [],
          createdAt: existing?.createdAt ?? now,
          updatedAt: now
        }
        return { ...current, items: sortItems([...current.items.filter((other) => other.id !== input.id), item]) }
      }),
    onSettled: () => list.settle()
  })
}

export function useDeleteGroceryItem() {
  const list = useOptimisticList()
  return useMutation({
    mutationKey: groceryKey,
    mutationFn: (id: string) => api.delete(`/grocery-list/items/${id}`),
    onMutate: (id) => list.update((current) => ({ ...current, items: current.items.filter((item) => item.id !== id) })),
    onSettled: () => list.settle()
  })
}

export function useGroceryListAction() {
  const list = useOptimisticList()
  return useMutation({
    mutationKey: groceryKey,
    mutationFn: (action: 'uncheck-all' | 'delete-checked') =>
      api.post(GrocerySchemas.GroceryList, `/grocery-list/${action}`, {}),
    onMutate: (action) =>
      list.update((current) => ({
        ...current,
        items:
          action === 'uncheck-all'
            ? current.items.map((item) => ({ ...item, checked: false }))
            : current.items.filter((item) => !item.checked)
      })),
    onSuccess: (result) => list.replace(result),
    onSettled: () => list.settle()
  })
}

export function usePreviewGroceries() {
  return useMutation({
    mutationFn: (plannedMealIds: string[]) =>
      api.post(GrocerySchemas.GroceryPreview, '/grocery-list/preview', { plannedMealIds })
  })
}

export function useAddMealsToList() {
  const list = useOptimisticList()
  return useMutation({
    mutationKey: groceryKey,
    mutationFn: (body: { plannedMealIds: string[]; excludeKeys: string[] }) =>
      api.post(GrocerySchemas.GroceryList, '/grocery-list/meals', body),
    onSuccess: (result) => list.replace(result)
  })
}

export function useResolveGroceryAlert() {
  const list = useOptimisticList()
  return useMutation({
    mutationKey: groceryKey,
    mutationFn: ({ id, addNew }: { id: string; addNew: boolean }) =>
      api.post(GrocerySchemas.GroceryList, `/grocery-list/alerts/${id}/resolve`, { addNew }),
    onMutate: ({ id }) =>
      list.update((current) => ({ ...current, alerts: current.alerts.filter((alert) => alert.id !== id) })),
    onSuccess: (result) => list.replace(result),
    onSettled: () => list.settle()
  })
}

function sortStores(stores: GroceryStore[]): GroceryStore[] {
  return [...stores].sort((a, b) => a.sortOrder - b.sortOrder)
}

export function useSaveGroceryStore() {
  const list = useOptimisticList()
  return useMutation({
    mutationKey: groceryKey,
    mutationFn: ({ id, ...body }: GroceryStoreInput) =>
      api.put(GrocerySchemas.GroceryStore, `/grocery-list/stores/${id}`, body),
    onMutate: (input) =>
      list.update((current) => ({
        ...current,
        stores: sortStores([...current.stores.filter((store) => store.id !== input.id), input])
      })),
    onSettled: () => list.settle()
  })
}

export function useDeleteGroceryStore() {
  const list = useOptimisticList()
  return useMutation({
    mutationKey: groceryKey,
    mutationFn: (id: string) => api.delete(`/grocery-list/stores/${id}`),
    onMutate: (id) =>
      list.update((current) => ({
        ...current,
        stores: current.stores.filter((store) => store.id !== id),
        items: current.items.map((item) => (item.storeId === id ? { ...item, storeId: null } : item))
      })),
    onSettled: () => list.settle()
  })
}

export function sortOrderBetween(before: number | undefined, after: number | undefined): number {
  if (before === undefined && after === undefined) return 1
  if (before === undefined) return (after ?? 0) - 1
  if (after === undefined) return before + 1
  return (before + after) / 2
}
