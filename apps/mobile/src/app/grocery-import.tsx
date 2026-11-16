import { lineText } from '@rotisserie/shared/groceries'
import { useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { useAddMealsToList, useGroceryList, usePreviewGroceries, type PreviewLine } from '~/api/groceries'
import { useMealsInRange, useUnscheduledPlannedMeals, type PlannedMeal } from '~/api/queries'
import { BottomBar } from '~/components/BottomBar'
import { Checkbox } from '~/components/controls'
import { FormSection, ModalHeader, useDismiss } from '~/components/ModalHeader'
import { HeaderButton } from '~/components/ScreenHeader'
import { useToast } from '~/components/Toast'
import { Button, ErrorState, Loading, Text } from '~/components/ui'
import { addDays, relativeDayLabel, today } from '~/lib/dates'
import { plannedDishName, slotLabel } from '~/lib/meals'
import { useColors } from '~/theme'

type Section = { title: string; meals: PlannedMeal[]; preselect: boolean }

function OptionRow({
  checked,
  onChange,
  title,
  detail
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  title: string
  detail: string
}) {
  const colors = useColors()
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      style={{
        minHeight: 56,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        borderBottomWidth: 1,
        borderBottomColor: colors.line
      }}
    >
      <Checkbox checked={checked} onChange={onChange} label={title} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong">{title}</Text>
        {detail ? (
          <Text variant="caption" tone="ink2">
            {detail}
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
}

function lineDetail(line: PreviewLine): string {
  const parts = [line.dishes.join(', '), line.onList ? `adds to “${line.onList}”` : null]
  return parts.filter(Boolean).join(' · ')
}

export default function GroceryImportScreen() {
  const dismiss = useDismiss()
  const toast = useToast()
  const { meal: onlyMeal } = useLocalSearchParams<{ meal?: string }>()
  const now = today()
  const upcoming = useMealsInRange(now, addDays(now, 13))
  const unscheduled = useUnscheduledPlannedMeals()
  const list = useGroceryList({ live: false })
  const preview = usePreviewGroceries()
  const add = useAddMealsToList()
  const [selected, setSelected] = useState<Set<string> | null>(null)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [step, setStep] = useState<'meals' | 'review'>('meals')

  const ready = upcoming.data !== undefined && unscheduled.data !== undefined && list.data !== undefined
  const added = new Set(list.data?.meals.map((meal) => meal.plannedMealId) ?? [])
  const fulfilled = new Set((upcoming.data?.cooked ?? []).map((meal) => meal.plannedMealId))
  const scheduled = (upcoming.data?.planned ?? []).filter((meal) => meal.dishes.length > 0 && !fulfilled.has(meal.id))
  const weekEnd = addDays(now, 6)
  const sections: Section[] = [
    { title: 'This week', meals: scheduled.filter((meal) => (meal.plannedOn ?? '') <= weekEnd), preselect: true },
    { title: 'Planned', meals: (unscheduled.data ?? []).filter((meal) => meal.dishes.length > 0), preselect: true },
    { title: 'Next week', meals: scheduled.filter((meal) => (meal.plannedOn ?? '') > weekEnd), preselect: false }
  ]

  useEffect(() => {
    if (!ready || selected !== null) return
    const initial = onlyMeal
      ? [onlyMeal]
      : sections.flatMap((section) =>
          section.preselect ? section.meals.filter((meal) => !added.has(meal.id)).map((meal) => meal.id) : []
        )
    setSelected(new Set(initial))
  }, [ready])

  const chosen = selected ?? new Set<string>()
  const lines = preview.data?.lines ?? []
  const keptCount = lines.filter((line) => !excluded.has(line.key)).length

  function toggle<T>(set: Set<T>, value: T, on: boolean): Set<T> {
    const next = new Set(set)
    if (on) next.add(value)
    else next.delete(value)
    return next
  }

  function review() {
    preview.mutate([...chosen], {
      onSuccess: (result) => {
        setExcluded(new Set(result.lines.filter((line) => line.ingredientId === null).map((line) => line.key)))
        setStep('review')
      },
      onError: (error) => toast({ message: error.message })
    })
  }

  function addToList() {
    add.mutate(
      { plannedMealIds: [...chosen], excludeKeys: [...excluded] },
      {
        onSuccess: () => {
          toast({ message: keptCount === 0 ? 'Meals marked as on the list' : `Added ${keptCount} to the list` })
          dismiss()
        },
        onError: (error) => toast({ message: error.message })
      }
    )
  }

  if (!ready) {
    const error = upcoming.error ?? unscheduled.error ?? list.error
    return error ? <ErrorState error={error} /> : <Loading />
  }

  if (step === 'review') {
    return (
      <View style={{ flex: 1 }}>
        <ModalHeader title="Review" right={<HeaderButton label="Meals" onPress={() => setStep('meals')} />} />
        <ScrollView contentContainerStyle={{ padding: 20, gap: 8 }}>
          <Text tone="ink2">Untick anything you already have.</Text>
          {lines.length === 0 ? (
            <Text tone="ink2" style={{ paddingVertical: 24, textAlign: 'center' }}>
              These meals have no ingredients to buy.
            </Text>
          ) : (
            <View>
              {lines.map((line) => (
                <OptionRow
                  key={line.key}
                  checked={!excluded.has(line.key)}
                  onChange={(on) => setExcluded((current) => toggle(current, line.key, !on))}
                  title={lineText(line)}
                  detail={lineDetail(line)}
                />
              ))}
            </View>
          )}
        </ScrollView>
        <BottomBar>
          <Button
            label={keptCount === 0 ? 'Add the meals only' : `Add ${keptCount} item${keptCount === 1 ? '' : 's'}`}
            busy={add.isPending}
            onPress={addToList}
          />
        </BottomBar>
      </View>
    )
  }

  const empty = sections.every((section) => section.meals.length === 0)
  return (
    <View style={{ flex: 1 }}>
      <ModalHeader
        title="Add from meals"
        right={<HeaderButton label="Next" disabled={chosen.size === 0 || preview.isPending} onPress={review} />}
      />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 24 }}>
        {empty ? (
          <Text tone="ink2" style={{ paddingVertical: 24, textAlign: 'center' }}>
            No upcoming meals with dishes. Plan a few, then add what they need here.
          </Text>
        ) : null}
        {sections.map((section) =>
          section.meals.length === 0 ? null : (
            <FormSection key={section.title} title={section.title}>
              <View>
                {section.meals.map((meal) => (
                  <OptionRow
                    key={meal.id}
                    checked={chosen.has(meal.id)}
                    onChange={(on) => setSelected(toggle(chosen, meal.id, on))}
                    title={meal.dishes.map(plannedDishName).join(', ')}
                    detail={[
                      meal.plannedOn
                        ? `${relativeDayLabel(meal.plannedOn, now)} · ${slotLabel(meal.mealSlot)}`
                        : slotLabel(meal.mealSlot),
                      added.has(meal.id) ? 'already on the list' : null
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  />
                ))}
              </View>
            </FormSection>
          )
        )}
      </ScrollView>
      <BottomBar>
        <Button
          label={chosen.size === 0 ? 'Pick a meal' : `Review ${chosen.size} meal${chosen.size === 1 ? '' : 's'}`}
          disabled={chosen.size === 0}
          busy={preview.isPending}
          onPress={review}
        />
      </BottomBar>
    </View>
  )
}
