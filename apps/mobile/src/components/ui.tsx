import type { ReactNode } from 'react'
import {
  ActivityIndicator,
  Pressable,
  Text as RNText,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle
} from 'react-native'
import { radius, type, useColors, type Palette } from '~/theme'

type TextVariant = keyof typeof type
type TextTone = 'ink' | 'ink2' | 'accent' | 'onGold' | 'danger' | 'chipInk'

export function Text({
  variant = 'body',
  tone = 'ink',
  style,
  ...props
}: TextProps & { variant?: TextVariant; tone?: TextTone }) {
  const colors = useColors()
  return <RNText {...props} style={[type[variant], { color: colors[tone] }, style]} />
}

type ButtonKind = 'primary' | 'secondary' | 'plain'

function buttonColors(kind: ButtonKind, colors: Palette): { background: string; text: TextTone } {
  if (kind === 'primary') return { background: colors.gold, text: 'onGold' }
  if (kind === 'secondary') return { background: colors.raised, text: 'ink' }
  return { background: 'transparent', text: 'accent' }
}

export function Button({
  label,
  kind = 'primary',
  icon,
  busy,
  disabled,
  style,
  ...props
}: Omit<PressableProps, 'style' | 'children'> & {
  label: string
  kind?: ButtonKind
  icon?: (color: string) => ReactNode
  busy?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const colors = useColors()
  const { background, text } = buttonColors(kind, colors)
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || busy}
      {...props}
      style={({ pressed }) => [
        {
          minHeight: 46,
          paddingHorizontal: 16,
          borderRadius: radius.md,
          backgroundColor: background,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          opacity: disabled ? 0.45 : pressed ? 0.75 : 1
        },
        style
      ]}
    >
      {busy ? <ActivityIndicator color={colors[text]} /> : icon?.(colors[text])}
      <Text variant="bodyStrong" tone={text} style={{ fontSize: 15 }}>
        {label}
      </Text>
    </Pressable>
  )
}

export function SectionHeading({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const colors = useColors()
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingBottom: 6,
          borderBottomWidth: 1,
          borderBottomColor: colors.line
        },
        style
      ]}
    >
      {children}
    </View>
  )
}

export function Chip({ label, style }: { label: string; style?: StyleProp<ViewStyle> }) {
  const colors = useColors()
  return (
    <View
      style={[
        {
          minHeight: 34,
          paddingHorizontal: 12,
          borderRadius: 17,
          backgroundColor: colors.chip,
          justifyContent: 'center'
        },
        style
      ]}
    >
      <Text variant="captionStrong" tone="chipInk">
        {label}
      </Text>
    </View>
  )
}

export function Centered({ children }: { children: ReactNode }) {
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>{children}</View>
}

export function Loading() {
  const colors = useColors()
  return (
    <Centered>
      <ActivityIndicator color={colors.ink2} />
    </Centered>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <Centered>
      <Text variant="heading">Couldn’t load this</Text>
      <Text tone="ink2" style={{ textAlign: 'center' }}>
        {error instanceof Error ? error.message : 'Something went wrong'}
      </Text>
      {onRetry ? <Button label="Try again" kind="secondary" onPress={onRetry} /> : null}
    </Centered>
  )
}

export const inputText: TextStyle = { ...type.body, paddingVertical: 0 }
