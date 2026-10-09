import {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
  Figtree_800ExtraBold,
  useFonts
} from '@expo-google-fonts/figtree'
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query'
import { DarkTheme, DefaultTheme, SplashScreen, Stack, ThemeProvider } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { AppState, Platform, useColorScheme } from 'react-native'
import { useSettle } from '~/api/queries'
import { ToastProvider } from '~/components/Toast'
import { today } from '~/lib/dates'
import { useColors } from '~/theme'

SplashScreen.preventAutoHideAsync()

function useSettleOnForeground() {
  const settle = useSettle()
  useEffect(() => {
    settle.mutate(today())
    const subscription = AppState.addEventListener('change', (state) => {
      if (Platform.OS !== 'web') focusManager.setFocused(state === 'active')
      if (state === 'active') settle.mutate(today())
    })
    return () => subscription.remove()
  }, [])
}

function AppStack() {
  const colors = useColors()
  const scheme = useColorScheme()
  useSettleOnForeground()
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme
  return (
    <ThemeProvider
      value={{
        ...base,
        colors: {
          ...base.colors,
          primary: colors.accent,
          background: colors.bg,
          card: colors.bg,
          text: colors.ink,
          border: colors.line
        }
      }}
    >
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <ToastProvider>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="create"
            options={{
              presentation: 'transparentModal',
              animation: 'fade',
              contentStyle: { backgroundColor: 'transparent' }
            }}
          />
          <Stack.Screen name="plan" options={{ presentation: 'modal' }} />
          <Stack.Screen name="log" options={{ presentation: 'modal' }} />
        </Stack>
      </ToastProvider>
    </ThemeProvider>
  )
}

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }))
  const [fontsLoaded, fontError] = useFonts({
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
    Figtree_800ExtraBold
  })

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync()
  }, [fontsLoaded, fontError])

  if (!fontsLoaded && !fontError) return null

  return (
    <QueryClientProvider client={queryClient}>
      <AppStack />
    </QueryClientProvider>
  )
}
