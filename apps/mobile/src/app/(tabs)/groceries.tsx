import type { GrocerySection } from '@rotisserie/shared/groceries'
import { randomUUID } from 'expo-crypto'
import { useIsFocused, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Keyboard, Pressable, ScrollView, View, type TextInputInstance } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  sortOrderBetween,
  useDeleteGroceryItem,
  useGroceryList,
  useGroceryListAction,
  useSaveGroceryItem,
  type GroceryItem
} from '~/api/groceries'
import { DEFAULT_VIEW, loadGroceryView, saveGroceryView, type GroceryView } from '~/api/grocery-view'
import { ListLink } from '~/components/controls'
import { GroceryAlerts } from '~/components/GroceryAlerts'
import { DraftRow, GroceryRow } from '~/components/GroceryRow'
import { GroceryItemSheet, GroceryStoresSheet } from '~/components/GrocerySheets'
import { Icon } from '~/components/Icon'
import { Sheet } from '~/components/Sheet'
import { useToast } from '~/components/Toast'
import { ErrorState, Loading, Text } from '~/components/ui'
import { AUTO_GROUP, filterItems, groupItems, itemDetail, type GroceryGroup, type GroupBy } from '~/lib/groceries'
import { useColors } from '~/theme'

const GROUP_LABELS: Record<GroupBy, string> = { none: 'None', store: 'Store', section: 'Section' }

type Draft = { group: string; at: number | null }

const END_DRAFT: Draft = { group: AUTO_GROUP, at: null }

function countLabel(items: GroceryItem[]): string | null {
  if (items.length === 0) return null
  const left = items.filter((item) => !item.checked).length
  if (left === 0) return 'Everything’s checked off'
  return `${left} to get${left < items.length ? ` · ${items.length - left} checked` : ''}`
}

function ViewChip({
  label,
  value,
  active,
  onPress
}: {
  label: string
  value: string
  active: boolean
  onPress: () => void
}) {
  const colors = useColors()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      onPress={onPress}
      style={{
        minHeight: 34,
        paddingLeft: 12,
        paddingRight: 8,
        borderRadius: 17,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: active ? colors.gold : colors.chip
      }}
    >
      <Text variant="captionStrong" tone={active ? 'onGold' : 'chipInk'}>
        {label}: {value}
      </Text>
      <Icon name="chevronDown" size={14} color={active ? colors.onGold : colors.chipInk} strokeWidth={2.5} />
    </Pressable>
  )
}

function OptionRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const colors = useColors()
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 50,
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
        opacity: pressed ? 0.6 : 1
      })}
    >
      <Text style={{ flex: 1 }} variant={selected ? 'bodyStrong' : 'body'}>
        {label}
      </Text>
      {selected ? <Icon name="check" size={20} color={colors.accent} strokeWidth={2.6} /> : null}
    </Pressable>
  )
}

export default function GroceriesScreen() {
  const colors = useColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const toast = useToast()
  const focused = useIsFocused()
  const list = useGroceryList({ live: focused })
  const save = useSaveGroceryItem()
  const remove = useDeleteGroceryItem()
  const action = useGroceryListAction()
  const inputs = useRef(new Map<string, TextInputInstance>())
  const draftInput = useRef<TextInputInstance>(null)
  const createdTop = useRef(-Infinity)
  const [draftAt, setDraftAt] = useState<Draft>(END_DRAFT)
  const [draft, setDraft] = useState('')
  const [focusDraft, setFocusDraft] = useState(0)
  const [view, setView] = useState<GroceryView>(DEFAULT_VIEW)
  const [mealId, setMealId] = useState<string | null>(null)
  const [picking, setPicking] = useState<'group' | 'store' | 'meal' | 'menu' | null>(null)
  const [itemSheetId, setItemSheetId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [storesOpen, setStoresOpen] = useState(false)

  useEffect(() => {
    loadGroceryView()
      .then(setView)
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (focusDraft > 0) draftInput.current?.focus()
  }, [focusDraft])

  if (list.isPending) return <Loading />
  if (list.isError) return <ErrorState error={list.error} onRetry={() => list.refetch()} />

  const { stores, meals } = list.data
  const storeId = stores.some((store) => store.id === view.storeId) ? view.storeId : null
  const meal = meals.find((candidate) => candidate.plannedMealId === mealId) ?? null
  const filter = { storeId, mealId: meal?.plannedMealId ?? null }
  const items = filterItems(list.data.items, filter)
  const groups = groupItems(items, view.groupBy, stores, filter)
  const activeGroup = groups.find((group) => group.key === draftAt.group) ?? groups.at(-1)
  const canAdd = meal === null
  const showStore = view.groupBy !== 'store' && storeId === null
  const itemSheet = list.data.items.find((item) => item.id === itemSheetId) ?? null
  const onError = (error: Error) => toast({ message: error.message })

  function changeView(next: Partial<GroceryView>) {
    const updated = { ...view, ...next }
    setView(updated)
    setDraftAt(END_DRAFT)
    saveGroceryView(updated).catch(() => undefined)
  }

  function inputRef(id: string) {
    return (input: TextInputInstance | null) => {
      if (input) inputs.current.set(id, input)
      else inputs.current.delete(id)
    }
  }

  function saveItem(
    item: GroceryItem,
    changes: { text?: string; checked?: boolean; storeId?: string | null; section?: GrocerySection | null }
  ) {
    save.mutate({ id: item.id, text: item.text, checked: item.checked, sortOrder: item.sortOrder, ...changes }, { onError })
  }

  function split(group: GroceryGroup) {
    const at = group.key === activeGroup?.key ? draftAt.at : null
    return {
      below: at === null ? group.items : group.items.filter((item) => item.sortOrder < at),
      above: at === null ? [] : group.items.filter((item) => item.sortOrder >= at)
    }
  }

  function createItems(texts: string[]): number | null {
    if (!activeGroup) return null
    const next = split(activeGroup).above[0]?.sortOrder
    let at = draftAt.at ?? Math.max(list.data?.items.at(-1)?.sortOrder ?? 0, createdTop.current) + 1
    for (const text of texts.map((line) => line.trim()).filter((line) => line !== '')) {
      save.mutate({ id: randomUUID(), text, checked: false, sortOrder: at, ...activeGroup.assign }, { onError })
      createdTop.current = Math.max(createdTop.current, at)
      at = sortOrderBetween(at, next)
    }
    return draftAt.at === null ? null : at
  }

  function submitDraft(lines: string[], remainder: string) {
    const created = lines.some((line) => line.trim() !== '')
    const nextAt = createItems(lines)
    setDraft(remainder)
    if (!created && remainder.trim() === '') {
      draftInput.current?.blur()
      setDraftAt(END_DRAFT)
    } else {
      setDraftAt({ group: activeGroup?.key ?? AUTO_GROUP, at: nextAt })
    }
  }

  function openDraft(group: GroceryGroup, after: GroceryItem | null) {
    const next = after ? group.items[group.items.indexOf(after) + 1] : undefined
    setDraftAt({ group: group.key, at: after && next ? sortOrderBetween(after.sortOrder, next.sortOrder) : null })
    setFocusDraft((count) => count + 1)
  }

  function focusBefore(group: GroceryGroup, index: number) {
    const previous = group.items[index - 1]
    if (previous) inputs.current.get(previous.id)?.focus()
  }

  const renderRow = (group: GroceryGroup) => (item: GroceryItem) => (
    <GroceryRow
      key={item.id}
      item={item}
      detail={itemDetail(item, stores, showStore)}
      inputRef={inputRef(item.id)}
      onToggle={(text) => saveItem(item, { text, checked: !item.checked })}
      onCommit={(text) => saveItem(item, { text })}
      onRemove={(previous) => {
        if (previous) focusBefore(group, group.items.indexOf(item))
        remove.mutate(item.id, { onError })
      }}
      onReturn={(remainder) => {
        if (!canAdd) return
        setDraft(remainder)
        openDraft(group, item)
      }}
      showMore={item.id === editingId}
      onFocusRow={() => setEditingId(item.id)}
      onMore={() => {
        Keyboard.dismiss()
        setItemSheetId(item.id)
      }}
    />
  )

  const draftRow = (group: GroceryGroup, below: GroceryItem[]) => (
    <DraftRow
      key="draft"
      value={draft}
      onChangeText={(value) => {
        const lines = value.split('\n')
        const remainder = lines.pop() ?? ''
        if (lines.length === 0) setDraft(value)
        else submitDraft(lines, remainder)
      }}
      inputRef={draftInput}
      placeholder={draftAt.at === null ? (items.length === 0 ? 'Milk, eggs, coffee…' : 'New item') : undefined}
      onSubmit={() => submitDraft([draft], '')}
      onBlur={() => {
        createItems([draft])
        setDraft('')
        setDraftAt(END_DRAFT)
      }}
      onBackspaceEmpty={() => {
        focusBefore(group, below.length)
        setDraftAt(END_DRAFT)
      }}
    />
  )

  const count = countLabel(items)
  const hasChecked = list.data.items.some((item) => item.checked)
  const storeName = stores.find((store) => store.id === storeId)?.name ?? 'All'

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top + 14, paddingHorizontal: 20, paddingBottom: 8, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ gap: 2 }}>
            <Text variant="title" accessibilityRole="header">
              Groceries
            </Text>
            {count ? (
              <Text variant="caption" tone="ink2">
                {count}
              </Text>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/grocery-import')}
              style={{ minHeight: 44, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Icon name="plus" size={18} color={colors.accent} strokeWidth={2.5} />
              <Text variant="label" tone="accent">
                From meals
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="More"
              onPress={() => setPicking('menu')}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="more" size={26} color={colors.accent} strokeWidth={3.2} />
            </Pressable>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <ViewChip
            label="Group"
            value={GROUP_LABELS[view.groupBy]}
            active={view.groupBy !== 'none'}
            onPress={() => setPicking('group')}
          />
          <ViewChip label="Store" value={storeName} active={storeId !== null} onPress={() => setPicking('store')} />
          {meals.length > 0 ? (
            <ViewChip label="Meal" value={meal?.label ?? 'All'} active={meal !== null} onPress={() => setPicking('meal')} />
          ) : null}
        </ScrollView>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 32, flexGrow: 1 }}
      >
        <GroceryAlerts alerts={list.data.alerts} />
        {groups.map((group) => {
          const { below, above } = split(group)
          const drafting = canAdd && group.key === activeGroup?.key
          return (
            <View key={group.key}>
              {group.title !== null ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={canAdd ? `Add to ${group.title}` : group.title}
                  disabled={!canAdd}
                  onPress={() => openDraft(group, null)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    paddingTop: 14,
                    paddingBottom: 6,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.line
                  }}
                >
                  <Text variant="section" style={{ flex: 1 }}>
                    {group.title}
                  </Text>
                  <Text variant="caption" tone="ink2">
                    {group.items.filter((item) => !item.checked).length || ''}
                  </Text>
                  {canAdd ? <Icon name="plus" size={18} color={colors.accent} strokeWidth={2.4} /> : null}
                </Pressable>
              ) : null}
              {below.map(renderRow(group))}
              {drafting ? draftRow(group, below) : null}
              {above.map(renderRow(group))}
            </View>
          )
        })}
        {list.data.items.length === 0 ? (
          <Text tone="ink2" style={{ paddingTop: 12 }}>
            Type to add an item, or tap From meals to add what your planned meals need.
          </Text>
        ) : meal !== null && items.length === 0 ? (
          <Text tone="ink2" style={{ paddingTop: 12 }}>
            Nothing on the list is for {meal.label}.
          </Text>
        ) : null}
        <Pressable
          accessibilityLabel="New item"
          disabled={!canAdd}
          onPress={() => {
            setDraftAt(END_DRAFT)
            setFocusDraft((value) => value + 1)
          }}
          style={{ flexGrow: 1, minHeight: 120 }}
        />
      </ScrollView>

      <Sheet visible={picking === 'group'} title="Group by" onClose={() => setPicking(null)}>
        {(['none', 'store', 'section'] as const).map((groupBy) => (
          <OptionRow
            key={groupBy}
            label={GROUP_LABELS[groupBy]}
            selected={view.groupBy === groupBy}
            onPress={() => {
              changeView({ groupBy })
              setPicking(null)
            }}
          />
        ))}
      </Sheet>

      <Sheet visible={picking === 'store'} title="Shopping at" onClose={() => setPicking(null)}>
        <OptionRow
          label="All stores"
          selected={storeId === null}
          onPress={() => {
            changeView({ storeId: null })
            setPicking(null)
          }}
        />
        {stores.map((store) => (
          <OptionRow
            key={store.id}
            label={store.name}
            selected={storeId === store.id}
            onPress={() => {
              changeView({ storeId: store.id })
              setPicking(null)
            }}
          />
        ))}
        <Text variant="caption" tone="ink2" style={{ paddingTop: 10 }}>
          A store shows its own items and the ones for any store.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setPicking(null)
            setStoresOpen(true)
          }}
          style={{ minHeight: 48, justifyContent: 'center' }}
        >
          <Text variant="label" tone="accent">
            {stores.length === 0 ? 'Add your stores' : 'Edit stores'}
          </Text>
        </Pressable>
      </Sheet>

      <Sheet visible={picking === 'meal'} title="Meal" onClose={() => setPicking(null)}>
        <OptionRow
          label="All meals"
          selected={meal === null}
          onPress={() => {
            setMealId(null)
            setPicking(null)
          }}
        />
        {meals.map((candidate) => (
          <OptionRow
            key={candidate.plannedMealId}
            label={candidate.label}
            selected={meal?.plannedMealId === candidate.plannedMealId}
            onPress={() => {
              setMealId(candidate.plannedMealId)
              setDraftAt(END_DRAFT)
              setPicking(null)
            }}
          />
        ))}
      </Sheet>

      <Sheet visible={picking === 'menu'} title="Groceries" onClose={() => setPicking(null)}>
        <ListLink
          label="Add from meals"
          onPress={() => {
            setPicking(null)
            router.push('/grocery-import')
          }}
        />
        <ListLink
          label="Stores"
          onPress={() => {
            setPicking(null)
            setStoresOpen(true)
          }}
        />
        {hasChecked ? (
          <>
            <ListLink
              label="Uncheck all"
              onPress={() => {
                setPicking(null)
                action.mutate('uncheck-all', { onError })
              }}
            />
            <ListLink
              danger
              label="Delete checked items"
              onPress={() => {
                setPicking(null)
                action.mutate('delete-checked', { onError })
              }}
            />
          </>
        ) : null}
      </Sheet>

      <GroceryItemSheet
        item={itemSheet}
        stores={stores}
        onClose={() => setItemSheetId(null)}
        onChange={(item, change) => saveItem(item, change)}
        onDelete={(item) => {
          setItemSheetId(null)
          remove.mutate(item.id, { onError })
        }}
        onManageStores={() => {
          setItemSheetId(null)
          setStoresOpen(true)
        }}
      />
      <GroceryStoresSheet visible={storesOpen} stores={stores} onClose={() => setStoresOpen(false)} />
    </View>
  )
}
