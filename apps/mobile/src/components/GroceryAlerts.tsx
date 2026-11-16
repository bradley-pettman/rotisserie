import { lineText } from '@rotisserie/shared/groceries'
import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { useResolveGroceryAlert, type GroceryAlert } from '~/api/groceries'
import { radius, useColors } from '~/theme'
import { Icon } from './Icon'
import { Sheet } from './Sheet'
import { useToast } from './Toast'
import { Button, Text } from './ui'

function alertTitle(alert: GroceryAlert): string {
  return alert.kind === 'removed' ? `${alert.label} is off the plan` : `${alert.label} changed`
}

function alertSummary(alert: GroceryAlert): string {
  if (alert.kind === 'removed') return 'What you added for it is still on the list'
  const parts = [
    ...alert.changed.map(({ after }) => `now ${lineText(after)}`),
    ...alert.added.map((line) => `new: ${lineText(line)}`),
    ...alert.removed.map((line) => `no ${line.name}`)
  ]
  return parts.join(' · ')
}

function ChangeRow({ title, detail, struck }: { title: string; detail: string; struck?: boolean }) {
  const colors = useColors()
  return (
    <View style={{ paddingVertical: 10, gap: 2, borderBottomWidth: 1, borderBottomColor: colors.line }}>
      <Text
        variant="bodyStrong"
        tone={struck ? 'ink2' : 'ink'}
        style={struck ? { textDecorationLine: 'line-through' } : undefined}
      >
        {title}
      </Text>
      <Text variant="caption" tone="ink2">
        {detail}
      </Text>
    </View>
  )
}

function AlertSheet({ alert, onClose }: { alert: GroceryAlert | null; onClose: () => void }) {
  const resolve = useResolveGroceryAlert()
  const toast = useToast()

  function finish(addNew: boolean) {
    if (alert === null) return
    const count = alert.increase.length
    resolve.mutate(
      { id: alert.id, addNew },
      {
        onSuccess: () =>
          addNew && count > 0 ? toast({ message: `Updated ${count} item${count === 1 ? '' : 's'}` }) : undefined,
        onError: (error) => toast({ message: error.message })
      }
    )
    onClose()
  }

  return (
    <Sheet visible={alert !== null} title={alert ? alertTitle(alert) : ''} onClose={onClose}>
      {alert ? (
        <View style={{ gap: 16 }}>
          <View>
            {alert.kind === 'removed' ? (
              <>
                <Text tone="ink2" style={{ paddingBottom: 6 }}>
                  It was deleted from the plan. If you haven’t bought these yet, you may not need them:
                </Text>
                {alert.removed.map((line) => (
                  <ChangeRow key={line.key} title={lineText(line)} detail={line.dishes.join(', ')} />
                ))}
              </>
            ) : (
              <>
                {alert.changed.map(({ before, after }) => (
                  <ChangeRow key={after.key} title={lineText(after)} detail={`Was ${lineText(before)}`} />
                ))}
                {alert.added.map((line) => (
                  <ChangeRow key={line.key} title={lineText(line)} detail="New" />
                ))}
                {alert.removed.map((line) => (
                  <ChangeRow key={line.key} title={lineText(line)} detail="No longer needed" struck />
                ))}
              </>
            )}
          </View>
          {alert.increase.length > 0 ? (
            <>
              <Text variant="caption" tone="ink2">
                Update the list adds the new items and the extra amounts. Anything no longer needed stays until you remove
                it.
              </Text>
              <Button label="Update the list" busy={resolve.isPending} onPress={() => finish(true)} />
              <Button label="Leave the list as it is" kind="secondary" onPress={() => finish(false)} />
            </>
          ) : (
            <Button label="Got it" onPress={() => finish(false)} />
          )}
        </View>
      ) : null}
    </Sheet>
  )
}

export function GroceryAlerts({ alerts }: { alerts: GroceryAlert[] }) {
  const colors = useColors()
  const [openId, setOpenId] = useState<string | null>(null)
  const open = alerts.find((alert) => alert.id === openId) ?? null
  if (alerts.length === 0 && open === null) return null
  return (
    <View style={{ gap: 8, paddingBottom: 8 }}>
      {alerts.map((alert) => (
        <Pressable
          key={alert.id}
          accessibilityRole="button"
          onPress={() => setOpenId(alert.id)}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            padding: 12,
            borderRadius: radius.md,
            backgroundColor: colors.chip,
            opacity: pressed ? 0.7 : 1
          })}
        >
          <Icon name="alert" size={22} color={colors.accent} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {alertTitle(alert)}
            </Text>
            <Text variant="caption" tone="chipInk" numberOfLines={2}>
              {alertSummary(alert)}
            </Text>
          </View>
          <Icon name="chevronRight" size={16} color={colors.ink2} strokeWidth={2.5} />
        </Pressable>
      ))}
      <AlertSheet alert={open} onClose={() => setOpenId(null)} />
    </View>
  )
}
