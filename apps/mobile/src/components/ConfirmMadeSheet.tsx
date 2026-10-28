import { useRouter } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import {
  useDeleteCookedMeal,
  usePlannedMeal,
  useUpsertCookedMeal,
  useUpsertPlannedMeal,
  type CookedMeal
} from '~/api/queries'
import { dayLabel, relativeDayLabel, today } from '~/lib/dates'
import { cookedDishName, slotLabel, summarize, toCookedInput, toPlannedInput } from '~/lib/meals'
import { ListLink } from './controls'
import { Sheet } from './Sheet'
import { useToast } from './Toast'
import { Text } from './ui'

export function ConfirmMadeSheet({ meal, visible, onClose }: { meal: CookedMeal; visible: boolean; onClose: () => void }) {
  const router = useRouter()
  const toast = useToast()
  const plan = usePlannedMeal(visible ? (meal.plannedMealId ?? undefined) : undefined)
  const upsertCooked = useUpsertCookedMeal()
  const upsertPlanned = useUpsertPlannedMeal()
  const deleteCooked = useDeleteCookedMeal()
  const [busy, setBusy] = useState(false)
  const { lead, rest } = summarize(meal.dishes.map(cookedDishName))
  const slot = slotLabel(meal.mealSlot)
  const relative = relativeDayLabel(meal.cookedOn)
  const day = relative === dayLabel(meal.cookedOn) ? relative : relative.toLowerCase()

  async function run(action: () => Promise<string>) {
    if (busy) return
    setBusy(true)
    try {
      toast({ message: await action() })
      onClose()
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Could not save' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet visible={visible} title="Did you make it?" onClose={onClose}>
      <View style={{ gap: 4, paddingBottom: 8 }}>
        <Text variant="bodyStrong" numberOfLines={2}>
          {rest ? `${lead} · ${rest}` : lead}
        </Text>
        <Text variant="caption" tone="ink2">
          {slot} was planned for {day}, so it was logged for you.
        </Text>
      </View>
      <ListLink
        label="Yes, made it"
        onPress={() =>
          run(async () => {
            await upsertCooked.mutateAsync(toCookedInput(meal))
            return `${slot} confirmed`
          })
        }
      />
      <ListLink
        label="Made something else"
        onPress={() => {
          onClose()
          router.push({ pathname: '/log', params: { cookedMealId: meal.id } })
        }}
      />
      <ListLink
        label="Didn’t make it"
        detail="Back to Planned"
        onPress={() =>
          run(async () => {
            if (meal.plannedMealId !== null && plan.isPending) throw new Error('Still loading the plan, try again')
            const pastPlan = plan.data?.plannedOn && plan.data.plannedOn < today() ? plan.data : null
            if (pastPlan) await upsertPlanned.mutateAsync(toPlannedInput(pastPlan, { plannedOn: null }))
            await deleteCooked.mutateAsync(meal.id)
            return pastPlan ? `${lead} is back in Planned` : 'Log deleted'
          })
        }
      />
    </Sheet>
  )
}
