import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ApiError } from '~/api/client'
import { useColors } from '~/theme'
import { Text } from './ui'

export function AuthLayout({
  title,
  subtitle,
  children,
  footer
}: {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}) {
  const colors = useColors()
  const insets = useSafeAreaInsets()
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          gap: 28,
          paddingHorizontal: 24,
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24
        }}
      >
        <View style={{ gap: 8 }}>
          <Text variant="title" accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? <Text tone="ink2">{subtitle}</Text> : null}
        </View>
        {children}
        {footer}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

export function FormError({ error }: { error: unknown }) {
  if (!error) return null
  return (
    <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
      {errorMessage(error)}
    </Text>
  )
}

export function fieldError(error: unknown, field: string): string | undefined {
  return error instanceof ApiError ? error.fields?.[field]?.[0] : undefined
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.fields ? 'Check the highlighted fields' : error.message
  return 'Couldn’t reach Rotisserie. Check your connection and try again'
}
