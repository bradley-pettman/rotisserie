import { useRouter } from 'expo-router'
import { useDeferredValue, useState } from 'react'
import { Pressable, View } from 'react-native'
import { useRecipeSearch } from '~/api/queries'
import { useColors } from '~/theme'
import { Field } from './controls'
import { Icon } from './Icon'
import { Text } from './ui'

export type PickedDish = { recipeId: string | null; name: string }

function Option({ title, detail, onPress }: { title: string; detail?: string; onPress: () => void }) {
  const colors = useColors()
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 48,
        paddingHorizontal: 14,
        paddingVertical: 6,
        justifyContent: 'center',
        borderTopWidth: 1,
        borderTopColor: colors.line,
        backgroundColor: pressed ? colors.raised : 'transparent'
      })}
    >
      <Text variant="bodyStrong">{title}</Text>
      {detail ? (
        <Text variant="caption" tone="ink2">
          {detail}
        </Text>
      ) : null}
    </Pressable>
  )
}

export function DishSearch({ onPick, label = 'Add a dish' }: { onPick: (dish: PickedDish) => void; label?: string }) {
  const colors = useColors()
  const router = useRouter()
  const [text, setText] = useState('')
  const query = useDeferredValue(text.trim())
  const search = useRecipeSearch(query)
  const matches = query ? (search.data?.recipes ?? []).slice(0, 5) : []
  const exact = matches.some((recipe) => recipe.name.toLowerCase() === query.toLowerCase())

  function pick(dish: PickedDish) {
    onPick(dish)
    setText('')
  }

  return (
    <View style={{ gap: 0 }}>
      <View style={{ justifyContent: 'center' }}>
        <Field
          accessibilityLabel={label}
          placeholder="Search recipes or type a dish"
          value={text}
          onChangeText={setText}
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={() => {
            if (!query) return
            const match = matches.find((recipe) => recipe.name.toLowerCase() === query.toLowerCase())
            pick(match ? { recipeId: match.id, name: match.name } : { recipeId: null, name: query })
          }}
          style={{ flex: 1 }}
        />
        <View pointerEvents="none" style={{ position: 'absolute', right: 14 }}>
          <Icon name="search" size={18} color={colors.ink2} />
        </View>
      </View>
      {query ? (
        <View
          style={{
            marginTop: 6,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.line,
            backgroundColor: colors.card,
            overflow: 'hidden'
          }}
        >
          <Text variant="tiny" tone="ink2" style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6 }}>
            {matches.length > 0 ? 'RECIPES' : 'NO RECIPE MATCHES'}
          </Text>
          {matches.map((recipe) => (
            <Option key={recipe.id} title={recipe.name} onPress={() => pick({ recipeId: recipe.id, name: recipe.name })} />
          ))}
          {exact ? null : (
            <>
              <Option
                title={`Add “${query}”`}
                detail="Just a dish, no recipe"
                onPress={() => pick({ recipeId: null, name: query })}
              />
              <Option
                title={`Create a recipe called “${query}”`}
                detail="Opens the recipe editor"
                onPress={() => {
                  setText('')
                  router.push({ pathname: '/recipe-editor', params: { name: query } })
                }}
              />
            </>
          )}
        </View>
      ) : null}
    </View>
  )
}

export function DishChip({ dish, onRemove }: { dish: PickedDish; onRemove: () => void }) {
  const colors = useColors()
  const isRecipe = dish.recipeId !== null
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 14,
        borderRadius: 20,
        backgroundColor: isRecipe ? colors.chip : 'transparent',
        borderWidth: isRecipe ? 0 : 1.5,
        borderStyle: 'dashed',
        borderColor: colors.ring
      }}
    >
      <Text variant="label" tone={isRecipe ? 'chipInk' : 'ink'}>
        {dish.name}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remove ${dish.name}`}
        onPress={onRemove}
        style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
      >
        <Icon name="close" size={14} color={isRecipe ? colors.chipInk : colors.ink2} strokeWidth={2.5} />
      </Pressable>
    </View>
  )
}
