import { useRouter } from 'expo-router'
import type { ReactNode } from 'react'
import { View } from 'react-native'
import { useColors } from '~/theme'
import { HeaderButton } from './ScreenHeader'
import { Text } from './ui'

export function ModalHeader({ title, right }: { title: string; right?: ReactNode }) {
  const colors = useColors()
  const dismiss = useDismiss()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: colors.line
      }}
    >
      <View style={{ flex: 1, alignItems: 'flex-start' }}>
        <HeaderButton label="Cancel" onPress={dismiss} />
      </View>
      <Text variant="bodyStrong" accessibilityRole="header" style={{ fontSize: 17 }}>
        {title}
      </Text>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>{right}</View>
    </View>
  )
}

export function FormSection({ title, children, detail }: { title: string; children: ReactNode; detail?: string }) {
  return (
    <View style={{ gap: 8 }}>
      <Text variant="section" accessibilityRole="header">
        {title}
      </Text>
      {children}
      {detail ? (
        <Text variant="caption" tone="ink2">
          {detail}
        </Text>
      ) : null}
    </View>
  )
}

export function useDismiss() {
  const router = useRouter()
  return () => (router.canGoBack() ? router.back() : router.replace('/'))
}
