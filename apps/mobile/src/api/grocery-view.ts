import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import type { GroupBy } from '~/lib/groceries'

const KEY = 'rotisserie.grocery-view'

export type GroceryView = { groupBy: GroupBy; storeId: string | null }

export const DEFAULT_VIEW: GroceryView = { groupBy: 'none', storeId: null }

function parse(raw: string | null): GroceryView {
  try {
    const value = raw === null ? null : (JSON.parse(raw) as Partial<GroceryView>)
    const groupBy = value?.groupBy === 'store' || value?.groupBy === 'section' ? value.groupBy : 'none'
    return { groupBy, storeId: typeof value?.storeId === 'string' ? value.storeId : null }
  } catch {
    return DEFAULT_VIEW
  }
}

export async function loadGroceryView(): Promise<GroceryView> {
  if (Platform.OS === 'web') return parse(globalThis.localStorage?.getItem(KEY) ?? null)
  return parse(await SecureStore.getItemAsync(KEY))
}

export async function saveGroceryView(view: GroceryView): Promise<void> {
  const raw = JSON.stringify(view)
  if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, raw)
  else await SecureStore.setItemAsync(KEY, raw)
}
