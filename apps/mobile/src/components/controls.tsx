import {
  Pressable,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle
} from 'react-native'
import { radius, type as typeScale, useColors } from '~/theme'
import { Icon } from './Icon'
import { Text } from './ui'

export function Stepper({
  value,
  onChange,
  min = 1,
  max = 99,
  format = String,
  label
}: {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  format?: (value: number) => string
  label: string
}) {
  const colors = useColors()
  const button = (text: string, accessibilityLabel: string, next: number, disabled: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={() => onChange(next)}
      style={{ width: 44, height: 40, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : 1 }}
    >
      <Text style={{ fontSize: 20, lineHeight: 24 }}>{text}</Text>
    </Pressable>
  )
  return (
    <View
      accessibilityLabel={`${label}: ${format(value)}`}
      style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.raised, borderRadius: radius.md }}
    >
      {button('−', `Fewer ${label.toLowerCase()}`, value - 1, value <= min)}
      <Text variant="label" style={{ minWidth: 48, textAlign: 'center' }}>
        {format(value)}
      </Text>
      {button('+', `More ${label.toLowerCase()}`, value + 1, value >= max)}
    </View>
  )
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  label: string
}) {
  const colors = useColors()
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{ flexDirection: 'row', gap: 2, padding: 3, backgroundColor: colors.raised, borderRadius: radius.md }}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={{
              flex: 1,
              height: 40,
              borderRadius: radius.sm,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: selected ? colors.card : 'transparent',
              shadowColor: '#000',
              shadowOpacity: selected ? 0.08 : 0,
              shadowRadius: 3,
              shadowOffset: { width: 0, height: 1 },
              elevation: selected ? 1 : 0
            }}
          >
            <Text variant={selected ? 'label' : 'caption'} tone={selected ? 'ink' : 'ink2'} style={{ fontSize: 14 }}>
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export function Stars({ value, onChange }: { value: number | null; onChange: (value: number | null) => void }) {
  const colors = useColors()
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Rating" style={{ flexDirection: 'row', marginLeft: -8 }}>
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = value !== null && star <= value
        return (
          <Pressable
            key={star}
            accessibilityRole="radio"
            accessibilityLabel={`${star} star${star === 1 ? '' : 's'}`}
            accessibilityState={{ selected: value === star }}
            onPress={() => onChange(value === star ? null : star)}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="star" size={30} color={filled ? colors.gold : colors.line} />
          </Pressable>
        )
      })}
    </View>
  )
}

export function Field({
  label,
  style,
  inputStyle,
  ...props
}: TextInputProps & { label?: string; style?: StyleProp<ViewStyle>; inputStyle?: StyleProp<TextStyle> }) {
  const colors = useColors()
  return (
    <View style={[{ gap: 6 }, style]}>
      {label ? (
        <Text variant="captionStrong" tone="ink2">
          {label}
        </Text>
      ) : null}
      <TextInput
        accessibilityLabel={label ?? props.placeholder}
        placeholderTextColor={colors.ink2}
        {...props}
        style={[
          typeScale.body,
          {
            minHeight: props.multiline ? 96 : 48,
            paddingHorizontal: 14,
            paddingVertical: props.multiline ? 12 : 0,
            borderRadius: radius.md,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.line,
            color: colors.ink,
            textAlignVertical: props.multiline ? 'top' : 'center'
          },
          inputStyle
        ]}
      />
    </View>
  )
}

export function ListLink({
  label,
  onPress,
  danger,
  detail
}: {
  label: string
  onPress: () => void
  danger?: boolean
  detail?: string
}) {
  const colors = useColors()
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 50,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderBottomWidth: danger ? 0 : 1,
        borderBottomColor: colors.line,
        opacity: pressed ? 0.6 : 1
      })}
    >
      <Text tone={danger ? 'danger' : 'ink'} style={{ flex: 1 }}>
        {label}
      </Text>
      {detail ? (
        <Text variant="caption" tone="ink2">
          {detail}
        </Text>
      ) : null}
      {danger ? null : <Icon name="chevronRight" size={16} color={colors.ink2} strokeWidth={2.5} />}
    </Pressable>
  )
}

export function Checkbox({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  const colors = useColors()
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={() => onChange(!checked)}
      hitSlop={10}
      style={{
        width: 24,
        height: 24,
        borderRadius: 7,
        borderWidth: checked ? 0 : 1.5,
        borderColor: colors.ring,
        backgroundColor: checked ? colors.gold : 'transparent',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {checked ? <Icon name="check" size={16} color={colors.onGold} strokeWidth={3} /> : null}
    </Pressable>
  )
}
