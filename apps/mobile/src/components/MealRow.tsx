import type { ReactNode } from 'react'
import { Pressable, View } from 'react-native'
import { useColors } from '~/theme'
import { Text } from './ui'

export function MealRow({
  marker,
  lead,
  rest,
  meta,
  muted,
  accessibilityLabel,
  onPress
}: {
  marker: ReactNode
  lead: string
  rest?: string
  meta?: string
  muted?: boolean
  accessibilityLabel?: string
  onPress?: () => void
}) {
  const colors = useColors()
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 46,
        opacity: pressed ? 0.6 : 1
      })}
    >
      {marker}
      <Text numberOfLines={1} tone={muted ? 'ink2' : 'ink'} style={{ flex: 1 }}>
        <Text variant={muted ? 'body' : 'bodyStrong'} tone={muted ? 'ink2' : 'ink'}>
          {lead}
        </Text>
        {rest ? <Text tone="ink2">{` · ${rest}`}</Text> : null}
      </Text>
      {meta ? (
        <View>
          <Text variant="caption" style={{ color: colors.ink2 }}>
            {meta}
          </Text>
        </View>
      ) : null}
    </Pressable>
  )
}
