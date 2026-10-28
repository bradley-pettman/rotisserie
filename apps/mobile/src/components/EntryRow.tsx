import { useRouter } from 'expo-router'
import { useState } from 'react'
import { cookedDishName, plannedDishName, slotLabel, summarize, type DayEntry } from '~/lib/meals'
import { useColors } from '~/theme'
import { ConfirmMadeSheet } from './ConfirmMadeSheet'
import { MadeMarker, PlannedMarker } from './Icon'
import { MealRow } from './MealRow'

export function EntryRow({ entry }: { entry: DayEntry }) {
  const colors = useColors()
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  if (entry.kind === 'cooked') {
    const { lead, rest } = summarize(entry.meal.dishes.map(cookedDishName))
    const unconfirmed = entry.meal.settledOn !== null
    const instead = entry.instead ? summarize(entry.instead.dishes.map(plannedDishName)).lead : null
    const state = unconfirmed ? 'logged for you, not confirmed' : instead ? `made instead of ${instead}` : 'made'
    return (
      <>
        <MealRow
          marker={
            unconfirmed ? (
              <MadeMarker fill={colors.chip} check={colors.ink2} />
            ) : (
              <MadeMarker fill={colors.gold} check={colors.onGold} />
            )
          }
          lead={lead}
          rest={rest}
          meta={slotLabel(entry.slot)}
          note={unconfirmed ? 'Did you make it?' : instead ? `Instead of ${instead}` : undefined}
          noteTone={unconfirmed ? 'accent' : 'ink2'}
          muted
          accessibilityLabel={`${slotLabel(entry.slot)}, ${state}: ${lead}${rest ? `, ${rest}` : ''}`}
          onPress={() =>
            unconfirmed ? setConfirming(true) : router.push({ pathname: '/log', params: { cookedMealId: entry.meal.id } })
          }
        />
        {unconfirmed ? (
          <ConfirmMadeSheet meal={entry.meal} visible={confirming} onClose={() => setConfirming(false)} />
        ) : null}
      </>
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
