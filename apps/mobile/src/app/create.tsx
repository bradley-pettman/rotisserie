import { useLocalSearchParams, useRouter, type Href } from 'expo-router'
import { Fragment } from 'react'
import { Pressable, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Icon, type IconName } from '~/components/Icon'
import { Text } from '~/components/ui'
import { radius, useColors } from '~/theme'

type Option = { label: string; detail: string; icon: IconName; href: Href }

const MEAL_OPTIONS: Option[] = [
  { label: 'Log a meal', detail: 'Record what you ate', icon: 'check', href: '/log' },
  { label: 'Plan a meal', detail: 'For a day, or for Planned', icon: 'calendar', href: '/plan' }
]

const RECIPE_OPTIONS: Option[] = [
  { label: 'Create a recipe', detail: 'Add one to the book', icon: 'book', href: '/recipe-editor' },
  {
    label: 'Import a recipe',
    detail: 'Paste a link from a website',
    icon: 'link',
    href: { pathname: '/recipe-editor', params: { mode: 'import' } }
  }
]

export default function CreateMenu() {
  const colors = useColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { from } = useLocalSearchParams<{ from?: string }>()
  const groups = from === 'recipes' ? [RECIPE_OPTIONS, MEAL_OPTIONS] : [MEAL_OPTIONS, RECIPE_OPTIONS]
  return (
    <View style={{ flex: 1, justifyContent: 'flex-end' }}>
      <Pressable
        accessibilityLabel="Close"
        onPress={() => router.back()}
        style={{ position: 'absolute', inset: 0, backgroundColor: colors.scrim }}
      />
      <View
        style={{
          marginHorizontal: 12,
          marginBottom: insets.bottom + 96,
          padding: 8,
          borderRadius: 20,
          backgroundColor: colors.card,
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 8 },
          elevation: 8
        }}
      >
        {groups.map((group, index) => (
          <Fragment key={group[0]?.label}>
            {index > 0 ? (
              <View style={{ height: 1, marginVertical: 4, marginHorizontal: 12, backgroundColor: colors.line }} />
            ) : null}
            {group.map((option) => (
              <Pressable
                key={option.label}
                accessibilityRole="button"
                onPress={() => router.replace(option.href)}
                style={({ pressed }) => ({
                  minHeight: 60,
                  paddingHorizontal: 12,
                  borderRadius: radius.md,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                  backgroundColor: pressed ? colors.raised : 'transparent'
                })}
              >
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    backgroundColor: colors.chip,
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <Icon name={option.icon} size={20} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{option.label}</Text>
                  <Text variant="caption" tone="ink2">
                    {option.detail}
                  </Text>
                </View>
              </Pressable>
            ))}
          </Fragment>
        ))}
      </View>
    </View>
  )
}
