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
import { AppState, Platform, useColorScheme, View } from 'react-native'
import { AuthProvider, useAuth } from '~/api/auth'
import { useSettle } from '~/api/queries'
import { ToastProvider } from '~/components/Toast'
import { ErrorState } from '~/components/ui'
import { today } from '~/lib/dates'
import { useColors } from '~/theme'

SplashScreen.preventAutoHideAsync()

function useSettleOnForeground(enabled: boolean) {
  const settle = useSettle()
  useEffect(() => {
    if (enabled) settle.mutate(today())
    const subscription = AppState.addEventListener('change', (state) => {
      if (Platform.OS !== 'web') focusManager.setFocused(state === 'active')
      if (state === 'active' && enabled) settle.mutate(today())
    })
    return () => subscription.remove()
  }, [enabled])
}

function AppStack() {
  const colors = useColors()
  const scheme = useColorScheme()
  const auth = useAuth()
  const signedIn = auth.status === 'signedIn'
  const member = signedIn && auth.me.household !== null
  useSettleOnForeground(member)

  useEffect(() => {
    if (auth.status !== 'loading') SplashScreen.hideAsync()
  }, [auth.status])

  if (auth.status === 'loading') return null
  if (auth.status === 'error') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ErrorState error={auth.error} onRetry={auth.retry} />
      </View>
    )
  }

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
          <Stack.Protected guard={auth.status === 'signedOut'}>
            <Stack.Screen name="sign-in" />
            <Stack.Screen name="sign-up" options={{ animation: 'fade' }} />
          </Stack.Protected>
          <Stack.Protected guard={signedIn && !member}>
            <Stack.Screen name="welcome" />
          </Stack.Protected>
          <Stack.Protected guard={member}>
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
            <Stack.Screen name="recipe-editor" options={{ presentation: 'modal' }} />
            <Stack.Screen name="household" options={{ presentation: 'modal' }} />
          </Stack.Protected>
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

  if (!fontsLoaded && !fontError) return null

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppStack />
      </AuthProvider>
    </QueryClientProvider>
  )
}
