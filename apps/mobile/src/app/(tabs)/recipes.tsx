import { useRouter } from 'expo-router'
import { useDeferredValue, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRecipeList, useTags, type RecipeSort } from '~/api/queries'
import { Field } from '~/components/controls'
import { Icon } from '~/components/Icon'
import { Sheet } from '~/components/Sheet'
import { ErrorState, Loading, Text } from '~/components/ui'
import { madeLabel, ratingLabel } from '~/lib/recipes'
import { useColors } from '~/theme'

const SORTS: { value: RecipeSort; label: string }[] = [
  { value: 'recentlyMade', label: 'Recently made' },
  { value: 'longestAgo', label: 'Longest since made' },
  { value: 'name', label: 'Name' },
  { value: 'rating', label: 'Rating' }
]

export default function RecipesScreen() {
  const colors = useColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<RecipeSort>('recentlyMade')
  const [tag, setTag] = useState('')
  const [choosingSort, setChoosingSort] = useState(false)
  const deferredQuery = useDeferredValue(query.trim())
  const recipes = useRecipeList({ q: deferredQuery, tag, sort })
  const tags = useTags()

  const rows = recipes.data?.pages.flatMap((page) => page.recipes) ?? []
  const tagNames = [...(tags.data ?? []).map((option) => option.name)].sort()

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top + 14, paddingHorizontal: 20, gap: 12, paddingBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="title" accessibilityRole="header">
            Recipes
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Sort: ${SORTS.find((option) => option.value === sort)?.label}`}
            onPress={() => setChoosingSort(true)}
            style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4 }}
          >
            <Text variant="label" tone="accent">
              {SORTS.find((option) => option.value === sort)?.label}
            </Text>
            <Icon name="chevronDown" size={16} color={colors.accent} strokeWidth={2.5} />
          </Pressable>
        </View>
        <Field
          placeholder="Search recipes or ingredients"
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
      </View>

      {tagNames.length > 0 ? (
        <View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingVertical: 8 }}
          >
            {['', ...tagNames].map((name) => {
              const selected = name === tag
              return (
                <Pressable
                  key={name || 'all'}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setTag(name)}
                  style={{
                    minHeight: 36,
                    paddingHorizontal: 14,
                    borderRadius: 18,
                    justifyContent: 'center',
                    backgroundColor: selected ? colors.gold : colors.chip
                  }}
                >
                  <Text variant="captionStrong" tone={selected ? 'onGold' : 'chipInk'}>
                    {name || 'All'}
                  </Text>
                </Pressable>
              )
            })}
          </ScrollView>
        </View>
      ) : null}

      {recipes.isPending ? (
        <Loading />
      ) : recipes.isError ? (
        <ErrorState error={recipes.error} onRetry={() => recipes.refetch()} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => row.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (recipes.hasNextPage && !recipes.isFetchingNextPage) recipes.fetchNextPage()
          }}
          ListFooterComponent={
            recipes.isFetchingNextPage ? <ActivityIndicator color={colors.ink2} style={{ paddingVertical: 16 }} /> : null
          }
          ListEmptyComponent={
            <Text tone="ink2" style={{ paddingVertical: 24, textAlign: 'center' }}>
              {deferredQuery
                ? `No recipes match “${deferredQuery}”${tag ? ` in ${tag}` : ''}.`
                : tag
                  ? `No recipes tagged ${tag}.`
                  : 'No recipes yet. Tap + to create one.'}
            </Text>
          }
          renderItem={({ item }) => {
            const rating = ratingLabel(item.stats)
            return (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(`/recipes/${item.id}`)}
                style={({ pressed }) => ({
                  minHeight: 64,
                  paddingVertical: 10,
                  justifyContent: 'center',
                  gap: 2,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.line,
                  opacity: pressed ? 0.6 : 1
                })}
              >
                <Text variant="bodyStrong" style={{ fontSize: 17 }}>
                  {item.name}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  {rating ? (
                    <>
                      <Icon name="star" size={14} color={colors.gold} />
                      <Text variant="captionStrong">{rating}</Text>
                      <Text variant="caption" tone="ink2">
                        ·
                      </Text>
                    </>
                  ) : null}
                  <Text variant="caption" tone="ink2">
                    {madeLabel(item.stats)}
                  </Text>
                </View>
              </Pressable>
            )
          }}
        />
      )}

      <Sheet visible={choosingSort} title="Sort recipes" onClose={() => setChoosingSort(false)}>
        {SORTS.map((option) => (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: option.value === sort }}
            onPress={() => {
              setSort(option.value)
              setChoosingSort(false)
            }}
            style={{ minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Text variant={option.value === sort ? 'bodyStrong' : 'body'}>{option.label}</Text>
            {option.value === sort ? <Icon name="check" color={colors.accent} /> : null}
          </Pressable>
        ))}
      </Sheet>
    </View>
  )
}
