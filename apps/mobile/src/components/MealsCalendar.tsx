import { useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, View } from 'react-native'
import { useMealsInRange, useUnscheduledPlannedMeals, useUpsertPlannedMeal, type PlannedMeal } from '~/api/queries'
import {
  addMonths,
  dayLabel,
  dayOfMonth,
  monthGrid,
  monthLabel,
  relativeDayLabel,
  startOfMonth,
  weekdayShort
} from '~/lib/dates'
import { entriesForDay, plannedDishName, SLOTS, slotLabel, summarize, toPlannedInput } from '~/lib/meals'
import { radius, useColors } from '~/theme'
import { EntryRow } from './EntryRow'
import { Icon } from './Icon'
import { TodayCard } from './TodayCard'
import { useToast } from './Toast'
import { ErrorState, SectionHeading, Text } from './ui'

export function MealsCalendar({ now }: { now: string }) {
  const colors = useColors()
  const router = useRouter()
  const toast = useToast()
  const upsert = useUpsertPlannedMeal()
  const [month, setMonth] = useState(() => startOfMonth(now))
  const [selected, setSelected] = useState(now)
  const grid = monthGrid(month)
  const meals = useMealsInRange(grid[0] ?? month, grid.at(-1) ?? month)
  const unscheduled = useUnscheduledPlannedMeals()
  const pool = unscheduled.data ?? []

  const days = useMemo(() => {
    const planned = meals.data?.planned ?? []
    const cooked = meals.data?.cooked ?? []
    return grid.map((day) => ({ day, entries: entriesForDay(day, planned, cooked) }))
  }, [meals.data, month])

  const entries = days.find(({ day }) => day === selected)?.entries ?? []
  const canPlan = selected >= now
  const free = SLOTS.filter((slot) => !entries.some((entry) => entry.slot === slot))
  const picks = canPlan
    ? free
        .map((slot) => ({ slot, meals: pool.filter((meal) => meal.mealSlot === slot) }))
        .filter(({ meals }) => meals.length > 0)
    : []
  const planSlot = free.includes('dinner') ? 'dinner' : free[0]
  const relative = relativeDayLabel(selected, now)
  const empty = entries.length === 0 ? (canPlan ? 'Nothing planned yet' : 'Nothing logged') : null

  function showMonth(next: string) {
    setMonth(next)
    setSelected(startOfMonth(now) === next ? now : next)
  }

  function select(day: string) {
    setSelected(day)
    if (startOfMonth(day) !== month) setMonth(startOfMonth(day))
  }

  function pick(meal: PlannedMeal) {
    const { lead } = summarize(meal.dishes.map(plannedDishName))
    upsert.mutate(toPlannedInput(meal, { plannedOn: selected }), {
      onSuccess: (saved) => toast({ message: `${lead} moved to ${relativeDayLabel(saved.plannedOn ?? selected, now)}` }),
      onError: (error) => toast({ message: error.message })
    })
  }

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={
        <RefreshControl
          refreshing={meals.isRefetching}
          onRefresh={async () => {
            await Promise.all([meals.refetch(), unscheduled.refetch()])
          }}
          tintColor={colors.ink2}
        />
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 4 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          onPress={() => showMonth(addMonths(month, -1))}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="chevronLeft" size={20} color={colors.ink} strokeWidth={2.5} />
        </Pressable>
        <Text variant="heading" accessibilityRole="header">
          {monthLabel(month)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next month"
          onPress={() => showMonth(addMonths(month, 1))}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="chevronRight" size={20} color={colors.ink} strokeWidth={2.5} />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.line }}>
        <View style={{ flexDirection: 'row' }}>
          {days.slice(0, 7).map(({ day }) => (
            <Text key={day} variant="tiny" tone="ink2" style={{ flex: 1, textAlign: 'center' }}>
              {weekdayShort(day).charAt(0)}
            </Text>
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingTop: 6 }}>
          {days.map(({ day, entries: dayEntries }) => {
            const inMonth = startOfMonth(day) === month
            const isToday = day === now
            const isSelected = day === selected
            const eaten = dayEntries.some((entry) => entry.kind === 'cooked')
            const planned = dayEntries.some((entry) => entry.kind === 'planned')
            const textColor = isSelected ? colors.onGold : !inMonth ? colors.ink3 : day < now ? colors.ink2 : colors.ink
            const state = eaten ? 'eaten' : planned ? 'planned' : 'nothing yet'
            return (
              <View key={day} style={{ width: '14.2857%', padding: 1 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${dayLabel(day)}${isToday ? ', today' : ''}, ${state}`}
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => select(day)}
                  style={{
                    height: 48,
                    borderRadius: radius.sm,
                    backgroundColor: isSelected ? colors.gold : day < now ? colors.raised : 'transparent',
                    borderWidth: isToday && !isSelected ? 1.5 : 0,
                    borderColor: colors.gold,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4
                  }}
                >
                  <Text variant={isToday || isSelected ? 'bodyStrong' : 'body'} style={{ color: textColor, fontSize: 15 }}>
                    {dayOfMonth(day)}
                  </Text>
                  <View
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: eaten ? (isSelected ? colors.onGold : colors.ink3) : 'transparent',
                      borderWidth: !eaten && planned ? 1.5 : 0,
                      borderColor: isSelected ? colors.onGold : colors.ring
                    }}
                  />
                </Pressable>
              </View>
            )
          })}
        </View>
      </View>

      <View style={{ gap: 12, paddingHorizontal: 20, paddingTop: 16 }}>
        <SectionHeading>
          <Text variant="section" tone={canPlan ? 'ink' : 'ink2'} accessibilityRole="header">
            {relative}
          </Text>
          {relative !== dayLabel(selected) ? (
            <Text variant="section" tone="ink2" style={{ fontFamily: 'Figtree_500Medium' }}>
              {dayLabel(selected)}
            </Text>
          ) : null}
          {empty ? (
            <Text variant="section" tone="ink2" style={{ fontFamily: 'Figtree_500Medium' }}>
              · {empty}
            </Text>
          ) : null}
        </SectionHeading>

        {meals.isError ? (
          <ErrorState error={meals.error} onRetry={() => meals.refetch()} />
        ) : (
          <View>
            {entries.map((entry) =>
              entry.kind === 'planned' && selected === now ? (
                <TodayCard key={entry.meal.id} meal={entry.meal} now={now} />
              ) : (
                <EntryRow key={entry.meal.id} entry={entry} />
              )
            )}
          </View>
        )}

        {picks.map(({ slot, meals: choices }) => (
          <View key={slot} style={{ gap: 10, padding: 14, backgroundColor: colors.raised, borderRadius: radius.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <Text variant="bodyStrong">{slotLabel(slot)}</Text>
              <Text variant="caption" tone="ink2">
                Pick from Planned
              </Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {choices.map((meal) => {
                const { lead } = summarize(meal.dishes.map(plannedDishName))
                return (
                  <Pressable
                    key={meal.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Plan ${lead} for ${dayLabel(selected)}`}
                    disabled={upsert.isPending}
                    onPress={() => pick(meal)}
                    style={({ pressed }) => ({
                      minHeight: 44,
                      paddingHorizontal: 16,
                      borderRadius: 22,
                      justifyContent: 'center',
                      backgroundColor: colors.card,
                      borderWidth: 1.5,
                      borderColor: colors.ring,
                      opacity: pressed || upsert.isPending ? 0.6 : 1
                    })}
                  >
                    <Text variant="label">{lead}</Text>
                  </Pressable>
                )
              })}
            </View>
          </View>
        ))}

        {canPlan && planSlot ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/plan', params: { day: selected, slot: planSlot } })}
            style={{ minHeight: 48, justifyContent: 'center' }}
          >
            <Text variant="label" tone="accent">
              + Plan something new for this day
            </Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  )
}
