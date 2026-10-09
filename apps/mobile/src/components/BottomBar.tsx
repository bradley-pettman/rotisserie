import type { ReactNode } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useColors } from '~/theme'

export function BottomBar({ children }: { children: ReactNode }) {
  const colors = useColors()
  const insets = useSafeAreaInsets()
  return (
    <View
      style={{
        gap: 8,
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: Math.max(insets.bottom, 16),
        borderTopWidth: 1,
        borderTopColor: colors.line,
        backgroundColor: colors.navBg
      }}
    >
      {children}
    </View>
  )
}
