import { canonicalizeName } from '@rotisserie/shared/base'
import { useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'
import { useTags } from '~/api/queries'
import { useColors } from '~/theme'
import { Field } from './controls'
import { Icon } from './Icon'
import { Sheet } from './Sheet'
import { Button, Text } from './ui'

export function TagSheet({
  visible,
  title,
  initial,
  saving,
  onClose,
  onSave
}: {
  visible: boolean
  title: string
  initial: string[]
  saving?: boolean
  onClose: () => void
  onSave: (tags: string[]) => void
}) {
  const colors = useColors()
  const tags = useTags()
  const [selected, setSelected] = useState<string[]>(initial)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    if (visible) {
      setSelected(initial)
      setDraft('')
    }
  }, [visible])

  const query = canonicalizeName(draft)
  const known = (tags.data ?? []).map((tag) => tag.name)
  const options = [...new Set([...selected, ...known])].filter((name) => !query || name.includes(query))
  const isNew = query.length > 0 && !known.includes(query) && !selected.includes(query)

  function toggle(name: string) {
    setSelected((current) => (current.includes(name) ? current.filter((tag) => tag !== name) : [...current, name]))
  }

  return (
    <Sheet visible={visible} title={title} onClose={onClose}>
      <View style={{ gap: 14 }}>
        <Field
          placeholder="Find or add a tag"
          value={draft}
          onChangeText={setDraft}
          autoCapitalize="none"
          returnKeyType="done"
          onSubmitEditing={() => {
            if (query) {
              if (!selected.includes(query)) toggle(query)
              setDraft('')
            }
          }}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {isNew ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                toggle(query)
                setDraft('')
              }}
              style={{
                minHeight: 40,
                paddingHorizontal: 14,
                borderRadius: 20,
                borderWidth: 1.5,
                borderStyle: 'dashed',
                borderColor: colors.ring,
                justifyContent: 'center'
              }}
            >
              <Text variant="label" tone="accent">
                + new tag “{query}”
              </Text>
            </Pressable>
          ) : null}
          {options.map((name) => {
            const on = selected.includes(name)
            return (
              <Pressable
                key={name}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                onPress={() => toggle(name)}
                style={{
                  minHeight: 40,
                  paddingHorizontal: 14,
                  borderRadius: 20,
                  backgroundColor: on ? colors.gold : colors.chip,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                {on ? <Icon name="check" size={14} color={colors.onGold} strokeWidth={3} /> : null}
                <Text variant="label" tone={on ? 'onGold' : 'chipInk'}>
                  {name}
                </Text>
              </Pressable>
            )
          })}
        </View>
        <Button label="Done" busy={saving} onPress={() => onSave(selected)} />
      </View>
    </Sheet>
  )
}
