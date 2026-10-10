import { useRouter } from 'expo-router'
import { useMemo, useRef, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useMealsInRange, useUnscheduledPlannedMeals, useUpsertPlannedMeal, type PlannedMeal } from '~/api/queries'
import { EmptyMarker, Icon, MadeMarker, PlannedMarker } from '~/components/Icon'
import { MealRow } from '~/components/MealRow'
import { Sheet } from '~/components/Sheet'
import { TodayCard } from '~/components/TodayCard'
import { useToast } from '~/components/Toast'
import { ErrorState, Loading, SectionHeading, Text } from '~/components/ui'
import { addDays, dayLabel, dayOfMonth, daysBetween, relativeDayLabel, startOfWeek, today, weekdayShort } from '~/lib/dates'
import {
  cookedDishName,
  entriesForDay,
  plannedDishName,
  slotLabel,
  summarize,
  toPlannedInput,
  type DayEntry
} from '~/lib/meals'
import { useColors } from '~/theme'

const DAYS_AHEAD = 13

export default function MealsScreen() {
  const colors = useColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const now = today()
  const weekStart = startOfWeek(now)
  const to = addDays(now, DAYS_AHEAD)
  const meals = useMealsInRange(weekStart, to)
  const unscheduled = useUnscheduledPlannedMeals()
  const [trayOpen, setTrayOpen] = useState(false)
  const [pickingFor, setPickingFor] = useState<string | null>(null)
  const scroll = useRef<ScrollView>(null)
  const offsets = useRef<Record<string, number>>({})
  const scrolledToToday = useRef(false)

  const days = useMemo(() => {
    const planned = meals.data?.planned ?? []
    const cooked = meals.data?.cooked ?? []
    return daysBetween(weekStart, to)
      .map((day) => ({ day, entries: entriesForDay(day, planned, cooked) }))
      .filter(({ day, entries }) => entries.length > 0 || (day >= now && day <= addDays(now, 6)))
  }, [meals.data, weekStart, to, now])

  const strip = daysBetween(weekStart, addDays(weekStart, 6)).map((day) => {
    const entries = days.find((d) => d.day === day)?.entries ?? []
    return {
      day,
      eaten: entries.some((entry) => entry.kind === 'cooked'),
      planned: entries.some((entry) => entry.kind === 'planned')
    }
  })

  function scrollToDay(day: string, animated = true) {
    const y = offsets.current[day]
    if (y !== undefined) scroll.current?.scrollTo({ y: Math.max(y - 4, 0), animated })
  }

  if (meals.isPending) return <Loading />
  if (meals.isError) return <ErrorState error={meals.error} onRetry={() => meals.refetch()} />

  const pool = unscheduled.data ?? []

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top + 14, borderBottomWidth: 1, borderBottomColor: colors.line }}>
        <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
          <Text variant="title" accessibilityRole="header">
            Meals
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: 14, paddingBottom: 12 }}>
          {strip.map(({ day, eaten, planned }) => {
            const isToday = day === now
            const past = day < now
            const textColor = isToday ? colors.onGold : past ? colors.ink2 : colors.ink
            const state = eaten ? 'eaten' : planned ? 'planned' : 'nothing yet'
            return (
              <Pressable
                key={day}
                accessibilityRole="button"
                accessibilityLabel={`${dayLabel(day)}${isToday ? ', today' : ''}, ${state}`}
                onPress={() => scrollToDay(day)}
                style={{
                  flex: 1,
                  height: 62,
                  borderRadius: 14,
                  backgroundColor: isToday ? colors.gold : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 3
                }}
              >
                <Text variant="tiny" style={{ color: textColor }}>
                  {weekdayShort(day).toUpperCase()}
                </Text>
                <Text variant="bodyStrong" style={{ color: textColor, fontSize: 17 }}>
                  {dayOfMonth(day)}
                </Text>
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: eaten ? (isToday ? colors.onGold : colors.ink3) : 'transparent',
                    borderWidth: !eaten && planned ? 1.5 : 0,
                    borderColor: isToday ? colors.onGold : colors.ring
                  }}
                />
              </Pressable>
            )
          })}
        </View>

        <View style={{ paddingHorizontal: 12, paddingBottom: 6 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: trayOpen }}
            onPress={() => setTrayOpen((open) => !open)}
            style={{ minHeight: 48, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}
          >
            <Icon name="tray" size={22} color={colors.accent} strokeWidth={2} />
            <Text variant="bodyStrong" style={{ flex: 1 }}>
              Planned
            </Text>
            <Text tone="ink2">{pool.length}</Text>
            <Icon name={trayOpen ? 'chevronDown' : 'chevronRight'} size={16} color={colors.ink2} strokeWidth={2.5} />
          </Pressable>
          {trayOpen ? (
            <ScrollView
              style={{ maxHeight: 240 }}
              contentContainerStyle={{ paddingLeft: 44, paddingRight: 10, paddingBottom: 6 }}
            >
              {pool.length === 0 ? (
                <Text tone="ink2" style={{ paddingVertical: 10 }}>
                  Nothing waiting for a day.
                </Text>
              ) : (
                pool.map((meal) => {
                  const { lead, rest } = summarize(meal.dishes.map(plannedDishName))
                  return (
                    <MealRow
                      key={meal.id}
                      marker={<PlannedMarker color={colors.ring} size={18} />}
                      lead={lead}
                      rest={rest}
                      meta={slotLabel(meal.mealSlot)}
                      onPress={() => router.push(`/planned/${meal.id}`)}
                    />
                  )
                })
              )}
            </ScrollView>
          ) : null}
        </View>
      </View>

      <ScrollView
        ref={scroll}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={meals.isRefetching}
            onRefresh={() => Promise.all([meals.refetch(), unscheduled.refetch()])}
            tintColor={colors.ink2}
          />
        }
      >
        <View style={{ gap: 22, paddingHorizontal: 20 }}>
          {days.map(({ day, entries }) => (
            <View
              key={day}
              onLayout={(event) => {
                offsets.current[day] = event.nativeEvent.layout.y
                if (day === now && !scrolledToToday.current) {
                  scrolledToToday.current = true
                  requestAnimationFrame(() => scrollToDay(now, false))
                }
              }}
            >
              <DaySection day={day} now={now} entries={entries} poolSize={pool.length} onPick={() => setPickingFor(day)} />
            </View>
          ))}
        </View>
      </ScrollView>

      <PlannedPicker day={pickingFor} pool={pool} onClose={() => setPickingFor(null)} />
    </View>
  )
}

function DaySection({
  day,
  now,
  entries,
  poolSize,
  onPick
}: {
  day: string
  now: string
  entries: DayEntry[]
  poolSize: number
  onPick: () => void
}) {
  const colors = useColors()
  const router = useRouter()
  const isToday = day === now
  const past = day < now
  const hasDinner = entries.some((entry) => entry.slot === 'dinner')

  return (
    <View style={{ gap: isToday ? 10 : 0 }}>
      <SectionHeading>
        {isToday ? <Icon name="star" size={18} color={colors.gold} /> : null}
        <Text variant="section" tone={past ? 'ink2' : 'ink'} accessibilityRole="header">
          {isToday ? 'Today' : relativeDayLabel(day, now)}
        </Text>
        {isToday || relativeDayLabel(day, now) !== dayLabel(day) ? (
          <Text variant="section" tone="ink2" style={{ fontFamily: 'Figtree_500Medium' }}>
            {dayLabel(day)}
          </Text>
        ) : null}
      </SectionHeading>

      <View>
        {entries.map((entry) =>
          entry.kind === 'planned' && isToday ? (
            <TodayCard key={entry.meal.id} meal={entry.meal} now={now} />
          ) : (
            <EntryRow key={entry.meal.id} entry={entry} />
          )
        )}
        {!past && !hasDinner ? (
          <MealRow
            marker={<EmptyMarker color={colors.accent} />}
            lead={poolSize > 0 ? 'Pick from Planned' : 'Plan dinner'}
            meta="Dinner"
            accessibilityLabel={
              poolSize > 0 ? `Pick dinner for ${dayLabel(day)} from Planned` : `Plan dinner for ${dayLabel(day)}`
            }
            onPress={poolSize > 0 ? onPick : () => router.push({ pathname: '/plan', params: { day, slot: 'dinner' } })}
          />
        ) : null}
      </View>
    </View>
  )
}

function EntryRow({ entry }: { entry: DayEntry }) {
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

function PlannedPicker({ day, pool, onClose }: { day: string | null; pool: PlannedMeal[]; onClose: () => void }) {
  const colors = useColors()
  const toast = useToast()
  const upsert = useUpsertPlannedMeal()
  return (
    <Sheet visible={day !== null} title={day ? `Pick for ${dayLabel(day)}` : ''} onClose={onClose}>
      {pool.map((meal) => {
        const { lead, rest } = summarize(meal.dishes.map(plannedDishName))
        return (
          <MealRow
            key={meal.id}
            marker={<PlannedMarker color={colors.ring} />}
            lead={lead}
            rest={rest}
            meta={meal.headcount ? `For ${meal.headcount}` : undefined}
            onPress={() => {
              if (!day) return
              upsert.mutate(toPlannedInput(meal, { plannedOn: day }), {
                onSuccess: () => {
                  onClose()
                  toast({ message: `${lead} moved to ${relativeDayLabel(day)}` })
                },
                onError: (error) => toast({ message: error.message })
              })
            }}
          />
        )
      })}
    </Sheet>
  )
}
