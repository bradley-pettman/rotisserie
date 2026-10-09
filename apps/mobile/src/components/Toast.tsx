import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Pressable, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useColors } from '~/theme'
import { Text } from './ui'

type ToastAction = { label: string; onPress: () => void }
type ToastOptions = { message: string; actions?: ToastAction[] }

const ToastContext = createContext<(options: ToastOptions) => void>(() => {})

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const colors = useColors()
  const insets = useSafeAreaInsets()
  const [toast, setToast] = useState<ToastOptions | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback((options: ToastOptions) => {
    if (timer.current) clearTimeout(timer.current)
    setToast(options)
    timer.current = setTimeout(() => setToast(null), 6000)
  }, [])

  useEffect(() => () => (timer.current ? clearTimeout(timer.current) : undefined), [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <View
          accessibilityLiveRegion="polite"
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: insets.bottom + 92,
            minHeight: 52,
            paddingLeft: 16,
            paddingRight: 6,
            borderRadius: 14,
            backgroundColor: colors.ink,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            shadowColor: '#000',
            shadowOpacity: 0.2,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
            elevation: 6
          }}
        >
          <Text variant="bodyStrong" style={{ flex: 1, color: colors.bg }}>
            {toast.message}
          </Text>
          {toast.actions?.map((action) => (
            <Pressable
              key={action.label}
              accessibilityRole="button"
              onPress={() => {
                setToast(null)
                action.onPress()
              }}
              style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' }}
            >
              <Text variant="bodyStrong" style={{ color: colors.gold }}>
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </ToastContext.Provider>
  )
}
