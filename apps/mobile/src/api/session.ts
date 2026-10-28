import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

const KEY = 'rotisserie.session-token'

export async function loadToken(): Promise<string | null> {
  if (Platform.OS === 'web') return globalThis.localStorage?.getItem(KEY) ?? null
  return SecureStore.getItemAsync(KEY)
}

export async function saveToken(token: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    if (token === null) globalThis.localStorage?.removeItem(KEY)
    else globalThis.localStorage?.setItem(KEY, token)
    return
  }
  if (token === null) await SecureStore.deleteItemAsync(KEY)
  else await SecureStore.setItemAsync(KEY, token)
}
