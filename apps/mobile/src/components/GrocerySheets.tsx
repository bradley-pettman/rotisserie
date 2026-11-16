import { GrocerySection, SECTION_LABELS } from '@rotisserie/shared/groceries'
import { randomUUID } from 'expo-crypto'
import { useState } from 'react'
import { Pressable, TextInput, View } from 'react-native'
import {
  sortOrderBetween,
  useDeleteGroceryStore,
  useSaveGroceryStore,
  type GroceryItem,
  type GroceryStore
} from '~/api/groceries'
import { radius, useColors } from '~/theme'
import { Field, ListLink } from './controls'
import { Icon } from './Icon'
import { Sheet } from './Sheet'
import { useToast } from './Toast'
import { inputText, Text } from './ui'

function Pill({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const colors = useColors()
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        minHeight: 36,
        paddingHorizontal: 14,
        borderRadius: 18,
        justifyContent: 'center',
        backgroundColor: selected ? colors.gold : colors.chip
      }}
    >
      <Text variant="captionStrong" tone={selected ? 'onGold' : 'chipInk'}>
        {label}
      </Text>
    </Pressable>
  )
}

export function Pills({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>
}

function useCreateStore(stores: GroceryStore[]) {
  const save = useSaveGroceryStore()
  const toast = useToast()
  return (name: string): string | null => {
    const trimmed = name.trim()
    if (!trimmed) return null
    const existing = stores.find((store) => store.name.toLowerCase() === trimmed.toLowerCase())
    if (existing) return existing.id
    const id = randomUUID()
    save.mutate(
      { id, name: trimmed, sortOrder: sortOrderBetween(stores.at(-1)?.sortOrder, undefined) },
      { onError: (error) => toast({ message: error.message }) }
    )
    return id
  }
}

export function GroceryItemSheet({
  item,
  stores,
  onClose,
  onChange,
  onDelete,
  onManageStores
}: {
  item: GroceryItem | null
  stores: GroceryStore[]
  onClose: () => void
  onChange: (item: GroceryItem, change: { storeId?: string | null; section?: GrocerySection | null }) => void
  onDelete: (item: GroceryItem) => void
  onManageStores: () => void
}) {
  const [newStore, setNewStore] = useState('')
  const createStore = useCreateStore(stores)

  return (
    <Sheet visible={item !== null} title={item?.text ?? ''} onClose={onClose}>
      {item ? (
        <View style={{ gap: 20 }}>
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text variant="section">Store</Text>
              <Pressable
                accessibilityRole="button"
                onPress={onManageStores}
                style={{ minHeight: 32, justifyContent: 'center' }}
              >
                <Text variant="captionStrong" tone="accent">
                  Edit stores
                </Text>
              </Pressable>
            </View>
            <Pills>
              <Pill label="Any store" selected={item.storeId === null} onPress={() => onChange(item, { storeId: null })} />
              {stores.map((store) => (
                <Pill
                  key={store.id}
                  label={store.name}
                  selected={item.storeId === store.id}
                  onPress={() => onChange(item, { storeId: store.id })}
                />
              ))}
            </Pills>
            <Field
              placeholder="Add a store"
              value={newStore}
              onChangeText={setNewStore}
              returnKeyType="done"
              onSubmitEditing={() => {
                const id = createStore(newStore)
                setNewStore('')
                if (id) onChange(item, { storeId: id })
              }}
            />
          </View>
          <View style={{ gap: 10 }}>
            <Text variant="section">Section</Text>
            <Pills>
              {GrocerySection.options.map((section) => (
                <Pill
                  key={section}
                  label={SECTION_LABELS[section]}
                  selected={item.section === section}
                  onPress={() => onChange(item, { section })}
                />
              ))}
            </Pills>
            <Text variant="caption" tone="ink2">
              The list remembers your choice for the next {item.text.toLowerCase()}.
            </Text>
          </View>
          <ListLink danger label="Delete item" onPress={() => onDelete(item)} />
        </View>
      ) : null}
    </Sheet>
  )
}

function StoreRow({
  store,
  onRename,
  onMoveUp,
  onDelete
}: {
  store: GroceryStore
  onRename: (name: string) => void
  onMoveUp?: () => void
  onDelete: () => void
}) {
  const colors = useColors()
  const [name, setName] = useState(store.name)
  return (
    <View
      style={{
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        borderBottomWidth: 1,
        borderBottomColor: colors.line
      }}
    >
      <TextInput
        value={name}
        onChangeText={setName}
        onBlur={() => (name.trim() && name.trim() !== store.name ? onRename(name.trim()) : setName(store.name))}
        accessibilityLabel={`Rename ${store.name}`}
        style={[inputText, { flex: 1, color: colors.ink, paddingVertical: 12 }]}
      />
      {onMoveUp ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Move ${store.name} up`}
          onPress={onMoveUp}
          style={{ width: 40, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="chevronUp" size={20} color={colors.ink2} strokeWidth={2.5} />
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Delete ${store.name}`}
        onPress={onDelete}
        style={{ width: 40, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md }}
      >
        <Icon name="trash" size={20} color={colors.danger} />
      </Pressable>
    </View>
  )
}

export function GroceryStoresSheet({
  visible,
  stores,
  onClose
}: {
  visible: boolean
  stores: GroceryStore[]
  onClose: () => void
}) {
  const save = useSaveGroceryStore()
  const remove = useDeleteGroceryStore()
  const toast = useToast()
  const createStore = useCreateStore(stores)
  const [newStore, setNewStore] = useState('')
  const onError = (error: Error) => toast({ message: error.message })

  return (
    <Sheet visible={visible} title="Stores" onClose={onClose}>
      <View style={{ gap: 12 }}>
        <Text variant="caption" tone="ink2">
          In the order you usually shop. Grouping by store follows this order.
        </Text>
        <View>
          {stores.map((store, index) => {
            const previous = stores[index - 1]
            return (
              <StoreRow
                key={store.id}
                store={store}
                onRename={(name) => save.mutate({ ...store, name }, { onError })}
                onMoveUp={
                  previous
                    ? () =>
                        save.mutate(
                          { ...store, sortOrder: sortOrderBetween(stores[index - 2]?.sortOrder, previous.sortOrder) },
                          { onError }
                        )
                    : undefined
                }
                onDelete={() => remove.mutate(store.id, { onError })}
              />
            )
          })}
        </View>
        <Field
          placeholder="Add a store"
          value={newStore}
          onChangeText={setNewStore}
          returnKeyType="done"
          onSubmitEditing={() => {
            createStore(newStore)
            setNewStore('')
          }}
        />
      </View>
    </Sheet>
  )
}
