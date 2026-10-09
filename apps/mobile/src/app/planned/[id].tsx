import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { useDeletePlannedMeal, useMealsInRange, usePlannedMeal, useUpsertPlannedMeal } from '~/api/queries'
import { BottomBar } from '~/components/BottomBar'
import { useDismiss } from '~/components/ModalHeader'
import { ListLink, Stepper } from '~/components/controls'
import { DayPicker } from '~/components/DayPicker'
import { HeaderButton, ScreenHeader } from '~/components/ScreenHeader'
import { Sheet } from '~/components/Sheet'
import { useToast } from '~/components/Toast'
import { useMadeIt } from '~/components/TodayCard'
import { Button, ErrorState, Loading, Text } from '~/components/ui'
import { addDays, fromIsoDate, relativeDayLabel, today } from '~/lib/dates'
import { slotLabel, toPlannedInput } from '~/lib/meals'
import { formatMinutes, totalMinutes } from '~/lib/recipes'
import { useColors } from '~/theme'

const LONG_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function whenLabel(plannedOn: string | null): string {
  if (!plannedOn) return 'Planned · no day yet'
  const relative = relativeDayLabel(plannedOn)
  const weekday = LONG_WEEKDAYS[fromIsoDate(plannedOn).getDay()]
  return relative.includes(',') ? relative : `${relative} · ${weekday}`
}

export default function PlannedMealScreen() {
  const colors = useColors()
  const router = useRouter()
  const dismiss = useDismiss()
  const toast = useToast()
  const { id } = useLocalSearchParams<{ id: string }>()
  const meal = usePlannedMeal(id)
  const upsert = useUpsertPlannedMeal()
  const remove = useDeletePlannedMeal()
  const madeIt = useMadeIt()
  const now = today()
  const upcoming = useMealsInRange(now, addDays(now, 13))
  const [moving, setMoving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  if (meal.isPending) return <Loading />
  if (meal.isError) return <ErrorState error={meal.error} onRetry={() => meal.refetch()} />

  const data = meal.data
  const people = data.headcount ?? 4
  const taken = new Set(
    (upcoming.data?.planned ?? [])
      .filter((other) => other.id !== data.id && other.mealSlot === data.mealSlot && other.plannedOn)
      .map((other) => other.plannedOn ?? '')
  )

  function save(changes: Parameters<typeof toPlannedInput>[1], message?: string) {
    upsert.mutate(toPlannedInput(data, changes), {
      onSuccess: () => (message ? toast({ message }) : undefined),
      onError: (error) => toast({ message: error.message })
    })
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader
        back="Meals"
        right={<HeaderButton label="Edit" onPress={() => router.push({ pathname: '/plan', params: { id } })} />}
      />
      <ScrollView contentContainerStyle={{ gap: 24, paddingHorizontal: 20, paddingTop: 6, paddingBottom: 32 }}>
        <View style={{ gap: 2 }}>
          <Text variant="caption" tone="ink2" style={{ fontSize: 14 }}>
            {whenLabel(data.plannedOn)}
          </Text>
          <Text variant="title" accessibilityRole="header">
            {slotLabel(data.mealSlot)}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
          <Text>People</Text>
          <Stepper label="People" value={people} onChange={(headcount) => save({ headcount })} />
        </View>

        <View>
          <Text
            variant="heading"
            accessibilityRole="header"
            style={{ paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.line }}
          >
            Dishes
          </Text>
          {data.dishes.map((dish) => {
            const recipe = dish.recipe
            const minutes = recipe ? totalMinutes(recipe) : 0
            return (
              <View
                key={dish.id}
                style={{
                  minHeight: 64,
                  paddingVertical: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.line
                }}
              >
                {recipe ? (
                  <Pressable
                    accessibilityRole="link"
                    onPress={() =>
                      router.push({ pathname: '/recipes/[id]', params: { id: recipe.id, people: String(people) } })
                    }
                    style={{ flex: 1, gap: 2 }}
                  >
                    <Text variant="dish" style={{ fontSize: 18, lineHeight: 24 }}>
                      {recipe.name}
                    </Text>
                    <Text variant="caption" tone="ink2">
                      {['Recipe', minutes ? formatMinutes(minutes) : null, recipe.servings ? `scaled to ${people}` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </Pressable>
                ) : (
                  <>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="dish" style={{ fontSize: 18, lineHeight: 24 }}>
                        {dish.customText}
                      </Text>
                      <Text variant="caption" tone="ink2">
                        No recipe
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() =>
                        router.push({
                          pathname: '/recipe-editor',
                          params: { name: dish.customText ?? '', plannedMealId: data.id, dishId: dish.id }
                        })
                      }
                      style={{ minHeight: 44, justifyContent: 'center' }}
                    >
                      <Text variant="captionStrong" tone="accent">
                        Make it a recipe
                      </Text>
                    </Pressable>
                  </>
                )}
              </View>
            )
          })}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/plan', params: { id } })}
            style={{ minHeight: 48, justifyContent: 'center' }}
          >
            <Text variant="label" tone="accent">
              + Add a dish
            </Text>
          </Pressable>
        </View>

        <View>
          <Text
            variant="heading"
            accessibilityRole="header"
            style={{ paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: colors.line }}
          >
            Change of plans
          </Text>
          <ListLink label={data.plannedOn ? 'Move to another day' : 'Pick a day'} onPress={() => setMoving(true)} />
          {data.plannedOn ? (
            <ListLink label="Put back in Planned" onPress={() => save({ plannedOn: null }, 'Back in Planned')} />
          ) : null}
          <ListLink
            danger
            label={confirmingDelete ? 'Tap again to delete' : 'Delete this meal'}
            onPress={() => {
              if (!confirmingDelete) return setConfirmingDelete(true)
              remove.mutate(data.id, {
                onSuccess: () => {
                  toast({ message: 'Meal deleted' })
                  dismiss()
                },
                onError: (error) => toast({ message: error.message })
              })
            }}
          />
        </View>
      </ScrollView>

      <BottomBar>
        <Button label="Made it" busy={madeIt.isPending} onPress={() => madeIt.run(data, now, () => dismiss())} />
        <Button
          label="Made something else"
          kind="secondary"
          onPress={() => router.push({ pathname: '/log', params: { plannedMealId: data.id, replace: '1' } })}
        />
      </BottomBar>

      <Sheet visible={moving} title={`Move ${slotLabel(data.mealSlot).toLowerCase()}`} onClose={() => setMoving(false)}>
        <DayPicker
          value={data.plannedOn}
          taken={taken}
          onChange={(plannedOn) => {
            setMoving(false)
            save({ plannedOn }, `Moved to ${relativeDayLabel(plannedOn)}`)
          }}
        />
      </Sheet>
    </View>
  )
}
