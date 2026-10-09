import { Pressable, View } from 'react-native'
import { addDays, dayLabel, dayOfMonth, daysBetween, today, weekdayShort } from '~/lib/dates'
import { useColors } from '~/theme'
import { Text } from './ui'

export function DayPicker({
  value,
  onChange,
  taken = new Set<string>(),
  days = 14
}: {
  value: string | null
  onChange: (day: string) => void
  taken?: Set<string>
  days?: number
}) {
  const colors = useColors()
  const now = today()
  const range = daysBetween(now, addDays(now, days - 1))
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 6 }}>
      {range.map((day) => {
        const selected = day === value
        const isTaken = taken.has(day) && !selected
        const textColor = selected ? colors.onGold : isTaken ? colors.ink3 : colors.ink
        return (
          <View key={day} style={{ width: `${100 / 7}%`, paddingHorizontal: 2 }}>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: isTaken }}
              accessibilityLabel={`${dayLabel(day)}${day === now ? ', today' : ''}${isTaken ? ', already planned' : ''}`}
              disabled={isTaken}
              onPress={() => onChange(day)}
              style={{
                height: 58,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                backgroundColor: selected ? colors.gold : 'transparent',
                borderWidth: day === now && !selected ? 1.5 : 0,
                borderColor: colors.ring
              }}
            >
              <Text variant="tiny" style={{ color: textColor }}>
                {weekdayShort(day).toUpperCase()}
              </Text>
              <Text
                variant="bodyStrong"
                style={{ color: textColor, fontSize: 16, textDecorationLine: isTaken ? 'line-through' : 'none' }}
              >
                {dayOfMonth(day)}
              </Text>
            </Pressable>
          </View>
        )
      })}
    </View>
  )
}
