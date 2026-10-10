import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { Linking, Pressable, ScrollView, View } from 'react-native'
import { useRecipe, useUpsertRecipe } from '~/api/queries'
import { BottomBar } from '~/components/BottomBar'
import { Stepper } from '~/components/controls'
import { Icon } from '~/components/Icon'
import { HeaderButton, ScreenHeader } from '~/components/ScreenHeader'
import { TagSheet } from '~/components/TagSheet'
import { useToast } from '~/components/Toast'
import { Button, Chip, ErrorState, Loading, Text } from '~/components/ui'
import { amountLabel, scaleFactor } from '~/lib/quantities'
import { hostname, instructionSteps, madeLabel, ratingLabel, recipeToInput, timesLabel } from '~/lib/recipes'
import { useColors } from '~/theme'

export default function RecipeScreen() {
  const colors = useColors()
  const router = useRouter()
  const toast = useToast()
  const { id, people: peopleParam } = useLocalSearchParams<{ id: string; people?: string }>()
  const recipe = useRecipe(id)
  const upsert = useUpsertRecipe()
  const [people, setPeople] = useState<number | null>(peopleParam ? Number(peopleParam) : null)
  const [tagging, setTagging] = useState(false)

  if (recipe.isPending) return <Loading />
  if (recipe.isError) return <ErrorState error={recipe.error} onRetry={() => recipe.refetch()} />

  const data = recipe.data
  const makes = data.servings
  const servingFor = people ?? makes ?? 4
  const factor = scaleFactor(makes, servingFor)
  const times = timesLabel(data)
  const rating = ratingLabel(data.stats)
  const steps = instructionSteps(data.instructions)

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader
        back="Back"
        right={<HeaderButton label="Edit" onPress={() => router.push({ pathname: '/recipe-editor', params: { id } })} />}
      />
      <ScrollView contentContainerStyle={{ gap: 26, paddingHorizontal: 20, paddingTop: 6, paddingBottom: 32 }}>
        <View style={{ gap: 10 }}>
          <Text variant="title" accessibilityRole="header">
            {data.name}
          </Text>
          {times ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="clock" size={16} color={colors.ink2} strokeWidth={2} />
              <Text variant="caption" tone="ink2" style={{ fontSize: 14 }}>
                {times}
              </Text>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {rating ? (
              <>
                <Icon name="star" size={18} color={colors.gold} />
                <Text variant="label">{rating}</Text>
              </>
            ) : null}
            <Text variant="caption" tone="ink2" style={{ fontSize: 14 }}>
              {[
                rating ? `${data.stats.ratingCount} rating${data.stats.ratingCount === 1 ? '' : 's'}` : null,
                madeLabel(data.stats)
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 4 }}>
            {data.tags.map((tag) => (
              <Chip key={tag.id} label={tag.name} />
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add a tag"
              onPress={() => setTagging(true)}
              style={{
                minHeight: 34,
                paddingHorizontal: 12,
                borderRadius: 17,
                borderWidth: 1.5,
                borderStyle: 'dashed',
                borderColor: colors.ring,
                justifyContent: 'center'
              }}
            >
              <Text variant="captionStrong" tone="accent">
                + Tag
              </Text>
            </Pressable>
          </View>
        </View>

        {data.ingredients.length > 0 ? (
          <View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-end',
                justifyContent: 'space-between',
                paddingBottom: 8,
                borderBottomWidth: 1,
                borderBottomColor: colors.line
              }}
            >
              <View style={{ gap: 2 }}>
                <Text variant="heading" accessibilityRole="header">
                  Ingredients
                </Text>
                {makes ? (
                  <Text variant="caption" tone="ink2">
                    Recipe makes {makes}
                  </Text>
                ) : null}
              </View>
              {makes ? (
                <Stepper label="People" value={servingFor} onChange={setPeople} format={(value) => `For ${value}`} />
              ) : null}
            </View>
            {data.ingredients.map((line, index) => {
              const quantity = line.quantity === null ? null : line.quantity * factor
              const last = index === data.ingredients.length - 1
              return (
                <View
                  key={line.id}
                  style={{
                    flexDirection: 'row',
                    gap: 12,
                    paddingVertical: 10,
                    borderBottomWidth: last ? 0 : 1,
                    borderBottomColor: colors.line
                  }}
                >
                  <Text variant="bodyStrong" tone="accent" style={{ width: 76 }}>
                    {amountLabel(quantity, line.unit)}
                  </Text>
                  <Text style={{ flex: 1 }}>
                    {line.ingredient.name}
                    {line.notes ? <Text tone="ink2">{` · ${line.notes}`}</Text> : null}
                  </Text>
                </View>
              )
            })}
          </View>
        ) : null}

        {steps.length > 0 ? (
          <View style={{ gap: 14 }}>
            <Text
              variant="heading"
              accessibilityRole="header"
              style={{ paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.line }}
            >
              Instructions
            </Text>
            {steps.map((step, index) => (
              <View key={index} style={{ flexDirection: 'row', gap: 12 }}>
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    backgroundColor: colors.chip,
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <Text variant="captionStrong" tone="chipInk">
                    {index + 1}
                  </Text>
                </View>
                <Text style={{ flex: 1, lineHeight: 24 }}>{step}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {data.notes ? (
          <View style={{ gap: 8 }}>
            <Text variant="heading" accessibilityRole="header">
              Notes
            </Text>
            <Text>{data.notes}</Text>
          </View>
        ) : null}

        {data.sourceUrl ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => data.sourceUrl && Linking.openURL(data.sourceUrl)}
            style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}
          >
            <Text variant="label" tone="accent">
              From {hostname(data.sourceUrl)}
            </Text>
            <Icon name="external" size={14} color={colors.accent} strokeWidth={2.5} />
          </Pressable>
        ) : null}
      </ScrollView>

      <BottomBar>
        <Button
          label="Add to Planned"
          icon={(color) => <Icon name="plus" size={20} color={color} strokeWidth={2.6} />}
          onPress={() => router.push({ pathname: '/plan', params: { recipeId: id, people: String(servingFor) } })}
        />
      </BottomBar>

      <TagSheet
        visible={tagging}
        title={`Tag ${data.name}`}
        initial={data.tags.map((tag) => tag.name)}
        saving={upsert.isPending}
        onClose={() => setTagging(false)}
        onSave={(tags) =>
          upsert.mutate(recipeToInput(data, { tags }), {
            onSuccess: () => setTagging(false),
            onError: (error) => toast({ message: error.message })
          })
        }
      />
    </View>
  )
}
