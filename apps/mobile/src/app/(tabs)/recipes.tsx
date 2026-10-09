import { useRouter } from 'expo-router'
import { useDeferredValue, useMemo, useState } from 'react'
import { FlatList, Pressable, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRecipeSearch } from '~/api/queries'
import { Field } from '~/components/controls'
import { Icon } from '~/components/Icon'
import { Sheet } from '~/components/Sheet'
import { ErrorState, Loading, Text } from '~/components/ui'
import { madeLabel, ratingLabel } from '~/lib/recipes'
import { useColors } from '~/theme'

type Sort = 'recentlyMade' | 'longestAgo' | 'name' | 'rating'

const SORTS: { value: Sort; label: string }[] = [
  { value: 'recentlyMade', label: 'Recently made' },
  { value: 'longestAgo', label: 'Longest since made' },
  { value: 'name', label: 'Name' },
  { value: 'rating', label: 'Rating' }
]

type Row = NonNullable<ReturnType<typeof useRecipeSearch>['data']>['recipes'][number]

function compare(sort: Sort): (a: Row, b: Row) => number {
  const byName = (a: Row, b: Row) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  const nullsLast = (a: string | number | null, b: string | number | null, direction: 1 | -1) => {
    if (a === b) return 0
    if (a === null) return 1
    if (b === null) return -1
    return a < b ? -direction : direction
  }
  if (sort === 'name') return byName
  if (sort === 'rating') return (a, b) => nullsLast(a.stats.averageRating, b.stats.averageRating, -1) || byName(a, b)
  if (sort === 'longestAgo') return (a, b) => nullsLast(a.stats.lastMadeOn, b.stats.lastMadeOn, 1) || byName(a, b)
  return (a, b) => nullsLast(a.stats.lastMadeOn, b.stats.lastMadeOn, -1) || byName(a, b)
}

export default function RecipesScreen() {
  const colors = useColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('recentlyMade')
  const [choosingSort, setChoosingSort] = useState(false)
  const deferredQuery = useDeferredValue(query.trim())
  const recipes = useRecipeSearch(deferredQuery)

  const rows = useMemo(() => [...(recipes.data?.recipes ?? [])].sort(compare(sort)), [recipes.data, sort])

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
          ListEmptyComponent={
            <Text tone="ink2" style={{ paddingVertical: 24, textAlign: 'center' }}>
              {deferredQuery ? `No recipes match “${deferredQuery}”.` : 'No recipes yet. Tap + to create one.'}
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
