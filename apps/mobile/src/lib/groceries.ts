import { GrocerySection, SECTION_LABELS } from '@rotisserie/shared/groceries'
import type { GroceryItem, GroceryStore } from '~/api/groceries'

export type GroupBy = 'none' | 'store' | 'section'

export type GroceryFilter = { storeId: string | null; mealId: string | null }

export type Assign = { storeId?: string | null; section?: GrocerySection | null }

export type GroceryGroup = { key: string; title: string | null; items: GroceryItem[]; assign: Assign; auto: boolean }

export const AUTO_GROUP = 'auto'

export function filterItems(items: GroceryItem[], filter: GroceryFilter): GroceryItem[] {
  return items.filter(
    (item) =>
      (filter.storeId === null || item.storeId === null || item.storeId === filter.storeId) &&
      (filter.mealId === null || item.mealIds.includes(filter.mealId))
  )
}

export function groupItems(
  items: GroceryItem[],
  groupBy: GroupBy,
  stores: GroceryStore[],
  filter: GroceryFilter
): GroceryGroup[] {
  const base: Assign = filter.storeId === null ? {} : { storeId: filter.storeId }
  if (groupBy === 'none') return [{ key: AUTO_GROUP, title: null, items, assign: base, auto: true }]

  if (groupBy === 'store') {
    const known = new Set(stores.map((store) => store.id))
    const shown = filter.storeId === null ? stores : stores.filter((store) => store.id === filter.storeId)
    return [
      ...shown.map((store) => ({
        key: store.id,
        title: store.name,
        items: items.filter((item) => item.storeId === store.id),
        assign: { storeId: store.id },
        auto: false
      })),
      {
        key: AUTO_GROUP,
        title: 'Any store',
        items: items.filter((item) => item.storeId === null || !known.has(item.storeId)),
        assign: {},
        auto: true
      }
    ]
  }

  const sections = GrocerySection.options.filter((section) => section !== 'other')
  return [
    ...sections
      .map((section) => ({
        key: section,
        title: SECTION_LABELS[section],
        items: items.filter((item) => item.section === section),
        assign: { ...base, section },
        auto: false
      }))
      .filter((group) => group.items.length > 0),
    {
      key: AUTO_GROUP,
      title: SECTION_LABELS.other,
      items: items.filter((item) => item.section === null || item.section === 'other'),
      assign: base,
      auto: true
    }
  ]
}

export function itemDetail(item: GroceryItem, stores: GroceryStore[], showStore: boolean): string {
  const store = showStore ? stores.find((candidate) => candidate.id === item.storeId)?.name : undefined
  return [store, item.dishes.length > 0 ? `for ${item.dishes.join(', ')}` : null].filter(Boolean).join(' · ')
}
