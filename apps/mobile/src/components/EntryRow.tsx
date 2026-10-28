import { useRouter } from 'expo-router'
import { cookedDishName, plannedDishName, slotLabel, summarize, type DayEntry } from '~/lib/meals'
import { useColors } from '~/theme'
import { MadeMarker, PlannedMarker } from './Icon'
import { MealRow } from './MealRow'

export function EntryRow({ entry }: { entry: DayEntry }) {
  const colors = useColors()
  const router = useRouter()
  if (entry.kind === 'cooked') {
    const { lead, rest } = summarize(entry.meal.dishes.map(cookedDishName))
    return (
      <MealRow
        marker={<MadeMarker fill={colors.gold} check={colors.onGold} />}
        lead={lead}
        rest={rest}
        meta={slotLabel(entry.slot)}
        muted
        accessibilityLabel={`${slotLabel(entry.slot)}, made: ${lead}${rest ? `, ${rest}` : ''}`}
        onPress={() => router.push({ pathname: '/log', params: { cookedMealId: entry.meal.id } })}
      />
    )
  }
  const { lead, rest } = summarize(entry.meal.dishes.map(plannedDishName))
  return (
    <MealRow
      marker={<PlannedMarker color={colors.ring} />}
      lead={lead}
      rest={rest}
      meta={slotLabel(entry.slot)}
      accessibilityLabel={`${slotLabel(entry.slot)}, planned: ${lead}${rest ? `, ${rest}` : ''}`}
      onPress={() => router.push(`/planned/${entry.meal.id}`)}
    />
  )
}
