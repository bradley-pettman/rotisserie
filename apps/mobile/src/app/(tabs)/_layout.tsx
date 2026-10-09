import { Link } from 'expo-router'
import { Tabs } from 'expo-router/js-tabs'
import { Pressable, View } from 'react-native'
import { Icon, type IconName } from '~/components/Icon'
import { Text } from '~/components/ui'
import { useColors } from '~/theme'

const TAB_ICONS: Record<string, IconName> = { index: 'list', recipes: 'book' }

export default function TabLayout() {
  const colors = useColors()
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
      tabBar={({ state, descriptors, navigation, insets }) => {
        const tabs = state.routes.map((route, index) => {
          const focused = state.index === index
          const label = descriptors[route.key]?.options.title ?? route.name
          const color = focused ? colors.ink : colors.ink2
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name)
              }}
              style={{ width: 72, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 2 }}
            >
              <Icon name={TAB_ICONS[route.name] ?? 'list'} size={24} color={color} strokeWidth={2} />
              <Text variant="tiny" style={{ color, letterSpacing: 0, fontSize: 11 }}>
                {label}
              </Text>
            </Pressable>
          )
        })
        return (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 44,
              paddingTop: 6,
              paddingBottom: Math.max(insets.bottom, 10),
              borderTopWidth: 1,
              borderTopColor: colors.line,
              backgroundColor: colors.navBg
            }}
          >
            {tabs[0]}
            <Link href="/create" asChild>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Create"
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: colors.gold,
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: '#4A2D14',
                  shadowOpacity: 0.2,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: 4
                }}
              >
                <Icon name="plus" size={26} color={colors.onGold} strokeWidth={2.6} />
              </Pressable>
            </Link>
            {tabs[1]}
          </View>
        )
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Meals' }} />
      <Tabs.Screen name="recipes" options={{ title: 'Recipes' }} />
    </Tabs>
  )
}
