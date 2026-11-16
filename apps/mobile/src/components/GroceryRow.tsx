import { useEffect, useRef, useState, type Ref } from 'react'
import { Pressable, TextInput, View, type TextInputInstance } from 'react-native'
import type { GroceryItem } from '~/api/groceries'
import { useColors } from '~/theme'
import { Icon } from './Icon'
import { inputText, Text } from './ui'

function CheckCircle({
  checked,
  label,
  onPress,
  onLongPress
}: {
  checked: boolean
  label: string
  onPress?: () => void
  onLongPress?: () => void
}) {
  const colors = useColors()
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      disabled={onPress === undefined}
      onPress={onPress}
      onLongPress={onLongPress}
      hitSlop={10}
      style={{
        width: 24,
        height: 24,
        marginTop: 9,
        borderRadius: 12,
        borderWidth: checked ? 0 : 1.5,
        borderColor: onPress === undefined ? colors.ink3 : colors.ring,
        backgroundColor: checked ? colors.gold : 'transparent',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {checked ? <Icon name="check" size={15} color={colors.onGold} strokeWidth={3} /> : null}
    </Pressable>
  )
}

const rowStyle = { flexDirection: 'row', alignItems: 'flex-start', gap: 12, minHeight: 44 } as const

export function GroceryRow({
  item,
  inputRef,
  onToggle,
  onCommit,
  onRemove,
  onReturn,
  onMore,
  onFocusRow,
  showMore,
  detail
}: {
  item: GroceryItem
  detail: string
  onMore: () => void
  onFocusRow: () => void
  showMore: boolean
  inputRef: Ref<TextInputInstance>
  onToggle: (text: string) => void
  onCommit: (text: string) => void
  onRemove: (focusPrevious: boolean) => void
  onReturn: (remainder: string) => void
}) {
  const colors = useColors()
  const [text, setText] = useState(item.text)
  const [focused, setFocused] = useState(false)
  const committed = useRef(item.text)
  const removed = useRef(false)

  useEffect(() => {
    if (!focused) {
      setText(item.text)
      committed.current = item.text
    }
  }, [item.text, focused])

  function commit(value = text) {
    if (removed.current) return
    const trimmed = value.trim()
    if (trimmed === '') {
      removed.current = true
      onRemove(false)
      return
    }
    if (trimmed !== committed.current) {
      committed.current = trimmed
      onCommit(trimmed)
    }
  }

  return (
    <View style={rowStyle}>
      <CheckCircle
        checked={item.checked}
        label={item.text}
        onPress={() => {
          const trimmed = text.trim()
          committed.current = trimmed || item.text
          onToggle(committed.current)
        }}
        onLongPress={onMore}
      />
      <View style={{ flex: 1 }}>
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={(value) => {
            const [head = '', ...rest] = value.split('\n')
            setText(head)
            if (rest.length === 0) return
            commit(head)
            onReturn(rest.join(' ').trim())
          }}
          onFocus={() => {
            setFocused(true)
            onFocusRow()
          }}
          onBlur={() => {
            setFocused(false)
            commit()
          }}
          onSubmitEditing={() => {
            commit()
            onReturn('')
          }}
          onKeyPress={(event) => {
            if (event.nativeEvent.key === 'Backspace' && text === '' && !removed.current) {
              removed.current = true
              onRemove(true)
            }
          }}
          multiline
          submitBehavior="submit"
          returnKeyType="next"
          accessibilityLabel={item.checked ? `${item.text}, checked` : item.text}
          style={[
            inputText,
            {
              flex: 1,
              paddingTop: 10,
              paddingBottom: 10,
              color: item.checked ? colors.ink2 : colors.ink,
              textDecorationLine: item.checked ? 'line-through' : 'none'
            }
          ]}
        />
        {detail ? (
          <Text variant="caption" tone="ink2" numberOfLines={1} style={{ marginTop: -6, paddingBottom: 8 }}>
            {detail}
          </Text>
        ) : null}
      </View>
      {showMore ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Store and section for ${item.text}`}
          onPress={onMore}
          style={{ width: 36, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="more" size={22} color={colors.accent} strokeWidth={3} />
        </Pressable>
      ) : null}
    </View>
  )
}

export function DraftRow({
  value,
  onChangeText,
  inputRef,
  placeholder,
  onSubmit,
  onBlur,
  onBackspaceEmpty
}: {
  value: string
  onChangeText: (text: string) => void
  inputRef: Ref<TextInputInstance>
  placeholder?: string
  onSubmit: () => void
  onBlur: () => void
  onBackspaceEmpty: () => void
}) {
  const colors = useColors()
  return (
    <View style={rowStyle}>
      <CheckCircle checked={false} label="New item" />
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.ink3}
        onSubmitEditing={onSubmit}
        onBlur={onBlur}
        onKeyPress={(event) => {
          if (event.nativeEvent.key === 'Backspace' && value === '') onBackspaceEmpty()
        }}
        multiline
        submitBehavior="submit"
        returnKeyType="next"
        accessibilityLabel="New item"
        style={[inputText, { flex: 1, paddingTop: 10, paddingBottom: 10, color: colors.ink }]}
      />
    </View>
  )
}
