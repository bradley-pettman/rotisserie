import { useRouter } from 'expo-router'
import { Pressable, View } from 'react-native'
import { useDeleteCookedMeal, useUpsertCookedMeal, type PlannedMeal } from '~/api/queries'
import { cookedFromPlan, slotLabel } from '~/lib/meals'
import { radius, useColors } from '~/theme'
import { Icon } from './Icon'
import { useToast } from './Toast'
import { Button, Text } from './ui'

export function TodayCard({ meal, now }: { meal: PlannedMeal; now: string }) {
  const colors = useColors()
  const router = useRouter()
  const madeIt = useMadeIt()

  return (
    <View
      style={{
        gap: 14,
        padding: 16,
        marginBottom: 10,
        backgroundColor: colors.card,
        borderRadius: radius.lg,
        shadowColor: '#4A2D14',
        shadowOpacity: 0.1,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
        elevation: 3
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${slotLabel(meal.mealSlot)}`}
        onPress={() => router.push(`/planned/${meal.id}`)}
        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 24 }}
      >
        <Text variant="captionStrong" tone="ink2">
          {slotLabel(meal.mealSlot)}
        </Text>
        {meal.headcount ? (
          <Text variant="captionStrong" tone="accent">
            For {meal.headcount}
          </Text>
        ) : null}
      </Pressable>
      <View>
        {meal.dishes.map((dish) =>
          dish.recipe ? (
            <Pressable
              key={dish.id}
              accessibilityRole="link"
              onPress={() => router.push(`/recipes/${dish.recipe?.id}`)}
              style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
            >
              <Text variant="dish" style={{ flex: 1 }}>
                {dish.recipe.name}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <Text variant="captionStrong" tone="accent">
                  Recipe
                </Text>
                <Icon name="chevronRight" size={14} color={colors.accent} strokeWidth={2.5} />
              </View>
            </Pressable>
          ) : (
            <View key={dish.id} style={{ minHeight: 44, justifyContent: 'center' }}>
              <Text variant="dish">{dish.customText}</Text>
            </View>
          )
        )}
        {meal.dishes.length === 0 ? <Text tone="ink2">No dishes yet</Text> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button
          label="Made it"
          style={{ flex: 1 }}
          busy={madeIt.isPending}
          icon={(color) => <Icon name="check" size={18} color={color} strokeWidth={2.6} />}
          onPress={() => madeIt.run(meal, now)}
        />
        <Button
          label="Something else"
          kind="secondary"
          style={{ flex: 1 }}
          onPress={() => router.push({ pathname: '/log', params: { plannedMealId: meal.id, replace: '1' } })}
        />
      </View>
    </View>
  )
}

export function useMadeIt() {
  const router = useRouter()
  const toast = useToast()
  const upsert = useUpsertCookedMeal()
  const remove = useDeleteCookedMeal()
  return {
    isPending: upsert.isPending,
    run(meal: PlannedMeal, cookedOn: string) {
      const input = cookedFromPlan(meal, cookedOn)
      upsert.mutate(input, {
        onSuccess: (cooked) =>
          toast({
            message: `${slotLabel(cooked.mealSlot)} logged`,
            actions: [
              { label: 'Undo', onPress: () => remove.mutate(cooked.id) },
              { label: 'Edit', onPress: () => router.push({ pathname: '/log', params: { cookedMealId: cooked.id } }) }
            ]
          }),
        onError: (error) => toast({ message: error.message })
      })
    }
  }
}
