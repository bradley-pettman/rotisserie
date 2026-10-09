import type { MealSlot } from '@rotisserie/shared/meals'
import { randomUUID } from 'expo-crypto'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native'
import {
  useCookedMeal,
  useDeleteCookedMeal,
  useDeletePlannedMeal,
  usePlannedMeal,
  useUnscheduledPlannedMeals,
  useUpsertCookedMeal,
  useUpsertPlannedMeal,
  type PlannedMeal
} from '~/api/queries'
import { BottomBar } from '~/components/BottomBar'
import { Checkbox, Field, ListLink, Segmented, Stars, Stepper } from '~/components/controls'
import { DishSearch } from '~/components/DishSearch'
import { Icon } from '~/components/Icon'
import { FormSection, ModalHeader, useDismiss } from '~/components/ModalHeader'
import { useToast } from '~/components/Toast'
import { Button, Text } from '~/components/ui'
import { addDays, relativeDayLabel, today } from '~/lib/dates'
import { plannedDishName, SLOTS, slotLabel, summarize, toPlannedInput } from '~/lib/meals'
import { radius, useColors } from '~/theme'

type Dish = {
  key: string
  recipeId: string | null
  label: string
  isLeftovers: boolean
  notes: string | null
  eaten: boolean
}

const SLOT_OPTIONS = SLOTS.map((slot) => ({ value: slot, label: slotLabel(slot) }))

function dishesFromPlan(meal: PlannedMeal): Dish[] {
  return meal.dishes.map((dish) => ({
    key: dish.id,
    recipeId: dish.recipe?.id ?? null,
    label: plannedDishName(dish),
    isLeftovers: false,
    notes: dish.notes,
    eaten: true
  }))
}

function defaultSlot(): MealSlot {
  const hour = new Date().getHours()
  if (hour < 11) return 'breakfast'
  if (hour < 15) return 'lunch'
  return 'dinner'
}

export default function LogScreen() {
  const colors = useColors()
  const router = useRouter()
  const dismiss = useDismiss()
  const toast = useToast()
  const params = useLocalSearchParams<{ plannedMealId?: string; cookedMealId?: string; replace?: string }>()
  const replacing = params.replace === '1'
  const editing = params.cookedMealId !== undefined
  const plan = usePlannedMeal(params.plannedMealId)
  const cooked = useCookedMeal(params.cookedMealId)
  const linkedPlan = usePlannedMeal(editing ? (cooked.data?.plannedMealId ?? undefined) : undefined)
  const pool = useUnscheduledPlannedMeals()
  const upsertCooked = useUpsertCookedMeal()
  const upsertPlanned = useUpsertPlannedMeal()
  const deletePlanned = useDeletePlannedMeal()
  const deleteCooked = useDeleteCookedMeal()
  const now = today()

  const [cookedOn, setCookedOn] = useState(now)
  const [mealSlot, setMealSlot] = useState<MealSlot>(defaultSlot)
  const [dishes, setDishes] = useState<Dish[]>([])
  const [headcount, setHeadcount] = useState(4)
  const [starRating, setStarRating] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [linkedPlanId, setLinkedPlanId] = useState<string | null>(null)
  const [pickedFromPool, setPickedFromPool] = useState<string | null>(null)
  const [returnToPlanned, setReturnToPlanned] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  useEffect(() => {
    if (loaded) return
    if (editing && cooked.data) {
      const meal = cooked.data
      setCookedOn(meal.cookedOn)
      setMealSlot(meal.mealSlot)
      setHeadcount(meal.headcount ?? 4)
      setStarRating(meal.starRating)
      setNotes(meal.notes ?? '')
      setLinkedPlanId(meal.plannedMealId)
      setDishes(meal.dishes.map((dish) => ({ ...dish, key: dish.id, eaten: true })))
      setLoaded(true)
    }
    if (!editing && params.plannedMealId && plan.data) {
      const meal = plan.data
      setMealSlot(meal.mealSlot)
      setHeadcount(meal.headcount ?? 4)
      if (meal.plannedOn && meal.plannedOn < now) setCookedOn(meal.plannedOn)
      if (!replacing) {
        setDishes(dishesFromPlan(meal))
        setLinkedPlanId(meal.id)
      }
      setLoaded(true)
    }
  }, [cooked.data, plan.data, loaded])

  const original = plan.data
  const eaten = dishes.filter((dish) => dish.eaten)
  const canSave = eaten.length > 0 && !busy
  const poolChoices = (pool.data ?? []).filter((meal) => meal.id !== params.plannedMealId)
  const title = editing
    ? `Edit ${slotLabel(mealSlot).toLowerCase()}`
    : replacing
      ? 'What did you make?'
      : `Log ${slotLabel(mealSlot).toLowerCase()}`

  function pickFromPool(meal: PlannedMeal) {
    if (pickedFromPool === meal.id) {
      setPickedFromPool(null)
      setDishes([])
      return
    }
    setPickedFromPool(meal.id)
    setDishes(dishesFromPlan(meal))
    if (meal.headcount) setHeadcount(meal.headcount)
  }

  async function save() {
    setBusy(true)
    try {
      let plannedMealId = editing ? linkedPlanId : (pickedFromPool ?? (replacing ? null : linkedPlanId))
      if (replacing && original) {
        if (returnToPlanned) await upsertPlanned.mutateAsync(toPlannedInput(original, { plannedOn: null }))
        else if (!pickedFromPool) plannedMealId = original.id
      }
      const saved = await upsertCooked.mutateAsync({
        id: params.cookedMealId ?? randomUUID(),
        plannedMealId,
        cookedOn,
        mealSlot,
        headcount,
        notes: notes.trim() || null,
        starRating,
        dishes: eaten.map((dish) => ({
          recipeId: dish.recipeId,
          label: dish.label,
          isLeftovers: dish.isLeftovers,
          notes: dish.notes
        }))
      })
      if (replacing && original && !returnToPlanned && pickedFromPool) await deletePlanned.mutateAsync(original.id)
      toast({ message: editing ? 'Saved' : `${slotLabel(saved.mealSlot)} logged for ${relativeDayLabel(saved.cookedOn)}` })
      dismiss()
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Could not save' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      <ModalHeader title={title} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: 24, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 }}
      >
        {!editing && !replacing && original ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              padding: 12,
              borderRadius: radius.md,
              backgroundColor: colors.raised
            }}
          >
            <Icon name="tray" size={16} color={colors.ink2} />
            <Text variant="caption" tone="ink2">
              Filled in from the planned {slotLabel(original.mealSlot).toLowerCase()}
            </Text>
          </View>
        ) : null}

        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text variant="section">When</Text>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.raised, borderRadius: radius.md }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Day before"
                onPress={() => setCookedOn((day) => addDays(day, -1))}
                style={{ width: 44, height: 40, alignItems: 'center', justifyContent: 'center' }}
              >
                <Icon name="chevronLeft" size={18} color={colors.ink} strokeWidth={2.5} />
              </Pressable>
              <Text variant="label" style={{ minWidth: 110, textAlign: 'center' }}>
                {relativeDayLabel(cookedOn)}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Day after"
                disabled={cookedOn >= now}
                onPress={() => setCookedOn((day) => addDays(day, 1))}
                style={{
                  width: 44,
                  height: 40,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: cookedOn >= now ? 0.3 : 1
                }}
              >
                <Icon name="chevronRight" size={18} color={colors.ink} strokeWidth={2.5} />
              </Pressable>
            </View>
          </View>
          <Segmented label="Meal" value={mealSlot} onChange={setMealSlot} options={SLOT_OPTIONS} />
        </View>

        {(replacing || (!editing && !original)) && poolChoices.length > 0 ? (
          <FormSection title="From Planned">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {poolChoices.map((meal) => {
                const selected = pickedFromPool === meal.id
                const { lead } = summarize(meal.dishes.map(plannedDishName))
                return (
                  <Pressable
                    key={meal.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    onPress={() => pickFromPool(meal)}
                    style={{
                      minHeight: 44,
                      paddingHorizontal: 16,
                      borderRadius: 22,
                      justifyContent: 'center',
                      backgroundColor: selected ? colors.gold : colors.chip
                    }}
                  >
                    <Text variant="label" tone={selected ? 'onGold' : 'chipInk'}>
                      {lead}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </FormSection>
        ) : null}

        <FormSection title="What you ate">
          <View>
            {dishes.map((dish) => (
              <View
                key={dish.key}
                style={{
                  minHeight: 52,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.line
                }}
              >
                <Checkbox
                  label={dish.label}
                  checked={dish.eaten}
                  onChange={(checked) =>
                    setDishes((current) =>
                      current.map((other) => (other.key === dish.key ? { ...other, eaten: checked } : other))
                    )
                  }
                />
                <Text variant="bodyStrong" tone={dish.eaten ? 'ink' : 'ink2'} style={{ flex: 1, fontSize: 17 }}>
                  {dish.label}
                </Text>
                <Pressable
                  accessibilityRole="switch"
                  accessibilityState={{ checked: dish.isLeftovers }}
                  accessibilityLabel={`${dish.label} was leftovers`}
                  onPress={() =>
                    setDishes((current) =>
                      current.map((other) =>
                        other.key === dish.key ? { ...other, isLeftovers: !other.isLeftovers } : other
                      )
                    )
                  }
                  style={{
                    minHeight: 32,
                    paddingHorizontal: 10,
                    borderRadius: 16,
                    justifyContent: 'center',
                    backgroundColor: dish.isLeftovers ? colors.chip : 'transparent'
                  }}
                >
                  <Text variant="captionStrong" tone={dish.isLeftovers ? 'chipInk' : 'ink2'}>
                    Leftovers
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
          <DishSearch
            label={dishes.length > 0 ? 'Add a dish' : 'What did you eat?'}
            onPick={(picked) =>
              setDishes((current) => [
                ...current,
                {
                  key: randomUUID(),
                  recipeId: picked.recipeId,
                  label: picked.name,
                  isLeftovers: false,
                  notes: null,
                  eaten: true
                }
              ])
            }
          />
        </FormSection>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
          <Text variant="section">People</Text>
          <Stepper label="People" value={headcount} onChange={setHeadcount} />
        </View>

        <FormSection title="How was it?">
          <Stars value={starRating} onChange={setStarRating} />
        </FormSection>

        <Field label="Notes" placeholder="Anything to change next time?" value={notes} onChangeText={setNotes} multiline />

        {replacing && original ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 12,
              padding: 14,
              borderRadius: radius.md,
              backgroundColor: colors.raised
            }}
          >
            <Checkbox label="Put the plan back in Planned" checked={returnToPlanned} onChange={setReturnToPlanned} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong">
                Put {summarize(original.dishes.map(plannedDishName)).lead.toLowerCase()} back in Planned
              </Text>
              <Text variant="caption" tone="ink2">
                Untick if you’re not making it after all
              </Text>
            </View>
          </View>
        ) : null}

        {editing ? (
          <ListLink
            danger
            label={confirmingDelete ? 'Tap again to delete' : 'Delete this log'}
            onPress={async () => {
              if (!confirmingDelete) return setConfirmingDelete(true)
              if (!params.cookedMealId) return
              try {
                const pastPlan = linkedPlan.data?.plannedOn && linkedPlan.data.plannedOn < now ? linkedPlan.data : null
                if (pastPlan) await upsertPlanned.mutateAsync(toPlannedInput(pastPlan, { plannedOn: null }))
                await deleteCooked.mutateAsync(params.cookedMealId)
                toast({ message: pastPlan ? 'Log deleted; its plan is back in Planned' : 'Log deleted' })
                dismiss()
              } catch (error) {
                toast({ message: error instanceof Error ? error.message : 'Could not delete' })
              }
            }}
          />
        ) : null}
      </ScrollView>

      <BottomBar>
        <Button label="Save" disabled={!canSave} busy={busy} onPress={save} />
      </BottomBar>
    </KeyboardAvoidingView>
  )
}
