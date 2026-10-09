import type { MealSlot } from '@rotisserie/shared/meals'
import { randomUUID } from 'expo-crypto'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native'
import {
  useMealsInRange,
  usePlannedMeal,
  useRecipe,
  useUnscheduledPlannedMeals,
  useUpsertPlannedMeal,
  type PlannedMeal
} from '~/api/queries'
import { BottomBar } from '~/components/BottomBar'
import { Segmented, Stepper } from '~/components/controls'
import { DayPicker } from '~/components/DayPicker'
import { DishChip, DishSearch, type PickedDish } from '~/components/DishSearch'
import { Icon } from '~/components/Icon'
import { FormSection, ModalHeader, useDismiss } from '~/components/ModalHeader'
import { useToast } from '~/components/Toast'
import { Button, Text } from '~/components/ui'
import { addDays, dayLabel, relativeDayLabel, today } from '~/lib/dates'
import { plannedDishName, SLOTS, slotLabel, summarize } from '~/lib/meals'
import { useColors } from '~/theme'

type Dish = PickedDish & { id: string; notes: string | null }

const SLOT_OPTIONS = SLOTS.map((slot) => ({ value: slot, label: slotLabel(slot) }))

function sameDish(a: { recipeId: string | null; name: string }, b: { recipeId: string | null; name: string }) {
  return a.recipeId !== null
    ? a.recipeId === b.recipeId
    : b.recipeId === null && a.name.toLowerCase() === b.name.toLowerCase()
}

function whereLabel(meal: PlannedMeal): string {
  const slot = slotLabel(meal.mealSlot).toLowerCase()
  return meal.plannedOn ? `${slot}, ${relativeDayLabel(meal.plannedOn)}` : `${slot}, no day yet`
}

export default function PlanScreen() {
  const colors = useColors()
  const router = useRouter()
  const dismiss = useDismiss()
  const toast = useToast()
  const params = useLocalSearchParams<{ id?: string; day?: string; slot?: MealSlot; recipeId?: string; people?: string }>()
  const existing = usePlannedMeal(params.id)
  const prefillRecipe = useRecipe(params.recipeId)
  const pool = useUnscheduledPlannedMeals()
  const now = today()
  const upcoming = useMealsInRange(now, addDays(now, 13))
  const upsert = useUpsertPlannedMeal()

  const [mealId, setMealId] = useState(() => params.id ?? randomUUID())
  const [dishes, setDishes] = useState<Dish[]>([])
  const [mode, setMode] = useState<'none' | 'day'>(params.day ? 'day' : 'none')
  const [plannedOn, setPlannedOn] = useState<string | null>(params.day ?? null)
  const [mealSlot, setMealSlot] = useState<MealSlot>(params.slot ?? 'dinner')
  const [headcount, setHeadcount] = useState(params.people ? Number(params.people) : 4)
  const [notes, setNotes] = useState<string | null>(null)
  const [poolOpen, setPoolOpen] = useState(!params.day)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (loaded) return
    if (params.id && existing.data) {
      const meal = existing.data
      setDishes(
        meal.dishes.map((dish) => ({
          id: dish.id,
          recipeId: dish.recipe?.id ?? null,
          name: plannedDishName(dish),
          notes: dish.notes
        }))
      )
      setMode(meal.plannedOn ? 'day' : 'none')
      setPlannedOn(meal.plannedOn)
      setMealSlot(meal.mealSlot)
      setHeadcount(meal.headcount ?? 4)
      setNotes(meal.notes)
      setPoolOpen(false)
      setLoaded(true)
    }
    if (!params.id && params.recipeId && prefillRecipe.data) {
      const recipe = prefillRecipe.data
      setDishes([{ id: randomUUID(), recipeId: recipe.id, name: recipe.name, notes: null }])
      setLoaded(true)
    }
  }, [existing.data, prefillRecipe.data, loaded])

  const otherMeals = useMemo(
    () => [...(pool.data ?? []), ...(upcoming.data?.planned ?? [])].filter((meal) => meal.id !== mealId),
    [pool.data, upcoming.data, mealId]
  )

  const taken = new Set(
    (upcoming.data?.planned ?? [])
      .filter((meal) => meal.id !== mealId && meal.mealSlot === mealSlot && meal.plannedOn !== null)
      .map((meal) => meal.plannedOn ?? '')
  )
  const cookedSlots = new Set(
    (upcoming.data?.cooked ?? []).filter((meal) => meal.mealSlot === mealSlot).map((meal) => meal.cookedOn)
  )
  cookedSlots.forEach((day) => taken.add(day))

  const duplicates = dishes.flatMap((dish) => {
    const other = otherMeals.find((meal) =>
      meal.dishes.some((planned) => sameDish(dish, { recipeId: planned.recipe?.id ?? null, name: plannedDishName(planned) }))
    )
    return other ? [{ dish, meal: other }] : []
  })

  const day = mode === 'day' ? plannedOn : null
  const canSave = dishes.length > 0 && (mode === 'none' || plannedOn !== null)
  const primaryLabel = params.id ? 'Save' : day ? `Plan for ${dayLabel(day)}` : 'Add to Planned'

  function reset() {
    setMealId(randomUUID())
    setDishes([])
    setNotes(null)
  }

  function save(another: boolean) {
    upsert.mutate(
      {
        id: mealId,
        plannedOn: day,
        mealSlot,
        headcount,
        notes,
        dishes: dishes.map((dish) => ({
          id: dish.id,
          recipeId: dish.recipeId,
          customText: dish.recipeId ? null : dish.name,
          notes: dish.notes
        }))
      },
      {
        onSuccess: () => {
          const { lead } = summarize(dishes.map((dish) => dish.name))
          toast({ message: day ? `${lead} planned for ${relativeDayLabel(day)}` : `${lead} added to Planned` })
          if (another) reset()
          else dismiss()
        },
        onError: (error) => toast({ message: error.message })
      }
    )
  }

  const poolMeals = pool.data ?? []

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      <ModalHeader title={params.id ? 'Edit plan' : 'Plan a meal'} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: 24, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 }}
      >
        {poolMeals.length > 0 ? (
          <View style={{ borderRadius: 14, backgroundColor: colors.raised, paddingHorizontal: 14 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: poolOpen }}
              onPress={() => setPoolOpen((open) => !open)}
              style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 }}
            >
              <Icon name="tray" size={20} color={colors.accent} strokeWidth={2} />
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                Already planned <Text tone="ink2">· {poolMeals.length} without a day</Text>
              </Text>
              <Icon name={poolOpen ? 'chevronDown' : 'chevronRight'} size={16} color={colors.ink2} strokeWidth={2.5} />
            </Pressable>
            {poolOpen
              ? poolMeals.map((meal) => {
                  const { lead, rest } = summarize(meal.dishes.map(plannedDishName))
                  return (
                    <View
                      key={meal.id}
                      style={{
                        minHeight: 40,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                        borderTopWidth: 1,
                        borderTopColor: colors.line
                      }}
                    >
                      <Text variant="caption" tone="ink2" style={{ width: 64 }}>
                        {slotLabel(meal.mealSlot)}
                      </Text>
                      <Text numberOfLines={1} style={{ flex: 1, fontSize: 15 }}>
                        <Text variant="bodyStrong" style={{ fontSize: 15 }}>
                          {lead}
                        </Text>
                        {rest ? <Text tone="ink2" style={{ fontSize: 15 }}>{` · ${rest}`}</Text> : null}
                      </Text>
                    </View>
                  )
                })
              : null}
            {poolOpen ? <View style={{ height: 6 }} /> : null}
          </View>
        ) : null}

        <FormSection title="Dishes" detail="Filled chips are recipes; dashed ones are just a dish.">
          {dishes.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {dishes.map((dish) => (
                <DishChip
                  key={dish.id}
                  dish={dish}
                  onRemove={() => setDishes((current) => current.filter((other) => other.id !== dish.id))}
                />
              ))}
            </View>
          ) : null}
          {duplicates.map(({ dish, meal }) => (
            <View key={dish.id} style={{ padding: 12, borderRadius: 12, backgroundColor: colors.chip }}>
              <Text variant="label" tone="chipInk">
                {dish.name} is already planned ({whereLabel(meal)}).
              </Text>
              <Text variant="caption" tone="chipInk">
                You can still add it again.
              </Text>
            </View>
          ))}
          <DishSearch
            onPick={(picked) =>
              setDishes((current) =>
                current.some((dish) => sameDish(dish, picked))
                  ? current
                  : [...current, { ...picked, id: randomUUID(), notes: null }]
              )
            }
          />
        </FormSection>

        <FormSection
          title="When"
          detail={mode === 'none' ? 'Goes to Planned. Pick its day later, or on the night.' : undefined}
        >
          <Segmented
            label="When"
            value={mode}
            onChange={(next) => {
              setMode(next)
              setPoolOpen(next === 'none')
            }}
            options={[
              { value: 'none', label: 'No day yet' },
              { value: 'day', label: 'Pick a day' }
            ]}
          />
          {mode === 'day' ? <DayPicker value={plannedOn} onChange={setPlannedOn} taken={taken} /> : null}
        </FormSection>

        <FormSection title="Meal">
          <Segmented label="Meal" value={mealSlot} onChange={setMealSlot} options={SLOT_OPTIONS} />
        </FormSection>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
          <Text variant="section">People</Text>
          <Stepper label="People" value={headcount} onChange={setHeadcount} />
        </View>
      </ScrollView>

      <BottomBar>
        <Button label={primaryLabel} disabled={!canSave} busy={upsert.isPending} onPress={() => save(false)} />
        {params.id ? null : (
          <Button label="Add and plan another" kind="secondary" disabled={!canSave} onPress={() => save(true)} />
        )}
      </BottomBar>
    </KeyboardAvoidingView>
  )
}
