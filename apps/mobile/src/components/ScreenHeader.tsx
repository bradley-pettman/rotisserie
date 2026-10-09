import { useRouter } from 'expo-router'
import type { ReactNode } from 'react'
import { Pressable, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useColors } from '~/theme'
import { Icon } from './Icon'
import { Text } from './ui'

export function HeaderButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={{ minHeight: 44, paddingHorizontal: 10, justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}
    >
      <Text variant="bodyStrong" tone="accent">
        {label}
      </Text>
    </Pressable>
  )
}

export function ScreenHeader({ back, right, modal }: { back?: string; right?: ReactNode; modal?: boolean }) {
  const colors = useColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  return (
    <View
      style={{
        paddingTop: modal ? 10 : insets.top + 8,
        paddingHorizontal: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}
    >
      {back ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={modal ? back : `Back to ${back}`}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={{ minHeight: 44, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 2 }}
        >
          {modal ? null : <Icon name="chevronLeft" color={colors.accent} strokeWidth={2.5} />}
          <Text variant="bodyStrong" tone="accent">
            {back}
          </Text>
        </Pressable>
      ) : (
        <View />
      )}
      {right}
    </View>
  )
}
