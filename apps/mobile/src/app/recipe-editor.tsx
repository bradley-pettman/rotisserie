import { canonicalizeName } from '@rotisserie/shared/base'
import { randomUUID } from 'expo-crypto'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native'
import { api } from '~/api/client'
import {
  useDeleteRecipe,
  useIngredientSearch,
  useRecipe,
  useUnits,
  useUpsertPlannedMeal,
  useUpsertRecipe
} from '~/api/queries'
import { Field, ListLink } from '~/components/controls'
import { Icon } from '~/components/Icon'
import { FormSection, ModalHeader, useDismiss } from '~/components/ModalHeader'
import { HeaderButton } from '~/components/ScreenHeader'
import { TagSheet } from '~/components/TagSheet'
import { useToast } from '~/components/Toast'
import { Chip, Text } from '~/components/ui'
import { toPlannedInput } from '~/lib/meals'
import { amountLabel, formatIngredientLine, parseIngredientLine, type ParsedIngredient } from '~/lib/quantities'
import { instructionSteps } from '~/lib/recipes'
import { PlannedMealSchemas } from '@rotisserie/shared/meals'
import { useColors } from '~/theme'

type Line = ParsedIngredient & { key: string }

function toNumber(text: string): number | null {
  const value = Number.parseInt(text, 10)
  return Number.isFinite(value) && value >= 0 ? value : null
}

function normalizeUrl(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

export default function RecipeEditor() {
  const colors = useColors()
  const router = useRouter()
  const dismiss = useDismiss()
  const toast = useToast()
  const params = useLocalSearchParams<{ id?: string; name?: string; plannedMealId?: string; dishId?: string }>()
  const existing = useRecipe(params.id)
  const units = useUnits()
  const upsert = useUpsertRecipe()
  const upsertPlanned = useUpsertPlannedMeal()
  const remove = useDeleteRecipe()

  const [recipeId] = useState(() => params.id ?? randomUUID())
  const [name, setName] = useState(params.name ?? '')
  const [servings, setServings] = useState('')
  const [prep, setPrep] = useState('')
  const [cook, setCook] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [draft, setDraft] = useState('')
  const [instructions, setInstructions] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [website, setWebsite] = useState('')
  const [notes, setNotes] = useState('')
  const [tagging, setTagging] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  useEffect(() => {
    if (loaded || !existing.data) return
    const recipe = existing.data
    setName(recipe.name)
    setServings(recipe.servings?.toString() ?? '')
    setPrep(recipe.prepTimeMinutes?.toString() ?? '')
    setCook(recipe.cookTimeMinutes?.toString() ?? '')
    setLines(
      recipe.ingredients.map((line) => ({
        key: line.id,
        quantity: line.quantity,
        unit: line.unit?.name ?? null,
        name: line.ingredient.name,
        notes: line.notes
      }))
    )
    setInstructions(
      instructionSteps(recipe.instructions)
        .map((step, index) => `${index + 1}. ${step}`)
        .join('\n')
    )
    setTags(recipe.tags.map((tag) => tag.name))
    setWebsite(recipe.sourceUrl ?? '')
    setNotes(recipe.notes ?? '')
    setLoaded(true)
  }, [existing.data, loaded])

  const unitList = units.data ?? []
  const unitNames = unitList.map((unit) => unit.name)
  const parsedDraft = draft.trim() ? parseIngredientLine(draft, unitNames) : null
  const suggestionQuery = parsedDraft && !draft.includes(',') ? parsedDraft.name : ''
  const suggestions = useIngredientSearch(suggestionQuery)
  const suggestionNames = suggestionQuery
    ? (suggestions.data ?? []).map((ingredient) => ingredient.name).filter((option) => option !== suggestionQuery)
    : []

  function addLines(texts: string[]) {
    const parsed = texts
      .map((text) => text.trim().replace(/^[-•*]\s*/, ''))
      .filter(Boolean)
      .map((text) => ({ ...parseIngredientLine(text, unitNames), key: randomUUID() }))
      .filter((line) => line.name)
    setLines((current) => [...current, ...parsed])
  }

  function onDraftChange(text: string) {
    if (!text.includes('\n')) return setDraft(text)
    const parts = text.split('\n')
    const last = parts.pop() ?? ''
    addLines(parts)
    setDraft(last)
  }

  function unitFor(unitName: string | null) {
    if (!unitName) return null
    return unitList.find((unit) => unit.name === unitName) ?? { name: unitName, abbreviation: null }
  }

  const canSave = name.trim().length > 0 && !saving

  async function save() {
    setSaving(true)
    try {
      const allLines = draft.trim() ? [...lines, { ...parseIngredientLine(draft, unitNames), key: 'draft' }] : lines
      await upsert.mutateAsync({
        id: recipeId,
        name: name.trim(),
        instructions: instructionSteps(instructions).join('\n'),
        prepTimeMinutes: toNumber(prep),
        cookTimeMinutes: toNumber(cook),
        servings: toNumber(servings) || null,
        sourceUrl: normalizeUrl(website),
        notes: notes.trim() || null,
        ingredients: allLines
          .filter((line) => line.name)
          .map((line) => ({ name: line.name, quantity: line.quantity, unit: line.unit, notes: line.notes })),
        tags
      })
      if (params.plannedMealId && params.dishId) {
        const meal = await api.get(PlannedMealSchemas.PlannedMeal, `/planned-meals/${params.plannedMealId}`)
        const input = toPlannedInput(meal)
        await upsertPlanned.mutateAsync({
          ...input,
          dishes: input.dishes.map((dish) => (dish.id === params.dishId ? { ...dish, recipeId, customText: null } : dish))
        })
      }
      toast({ message: params.id ? 'Recipe saved' : `${name.trim()} added to your recipes` })
      if (params.id) dismiss()
      else router.replace({ pathname: '/recipes/[id]', params: { id: recipeId } })
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Could not save the recipe' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      <ModalHeader
        title={params.id ? 'Edit recipe' : 'New recipe'}
        right={<HeaderButton label="Save" disabled={!canSave} onPress={save} />}
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: 24, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48 }}
      >
        <Field label="Name" value={name} onChangeText={setName} placeholder="Turkey chili" autoCapitalize="words" />

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Field label="Makes" value={servings} onChangeText={setServings} keyboardType="number-pad" style={{ flex: 1 }} />
          <Field label="Prep, min" value={prep} onChangeText={setPrep} keyboardType="number-pad" style={{ flex: 1 }} />
          <Field label="Cook, min" value={cook} onChangeText={setCook} keyboardType="number-pad" style={{ flex: 1 }} />
        </View>

        <FormSection
          title="Ingredients"
          detail="One per line, like “2 tbsp chili powder, heaped”. Paste a whole list to split it. Tap a line to edit it."
        >
          <View>
            {lines.map((line) => (
              <View
                key={line.key}
                style={{
                  minHeight: 48,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.line
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${formatIngredientLine(line)}`}
                  onPress={() => {
                    setLines((current) => current.filter((other) => other.key !== line.key))
                    setDraft(formatIngredientLine(line))
                  }}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 6,
                    paddingVertical: 6
                  }}
                >
                  {line.quantity !== null || line.unit ? (
                    <Text variant="bodyStrong" tone="accent">
                      {amountLabel(line.quantity, unitFor(line.unit))}
                    </Text>
                  ) : null}
                  <Text>{line.name}</Text>
                  {line.notes ? <Text tone="ink2">· {line.notes}</Text> : null}
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${line.name}`}
                  onPress={() => setLines((current) => current.filter((other) => other.key !== line.key))}
                  style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icon name="close" size={16} color={colors.ink2} strokeWidth={2.4} />
                </Pressable>
              </View>
            ))}
          </View>
          <Field
            accessibilityLabel="Add an ingredient"
            placeholder="2 tbsp chili powder"
            value={draft}
            onChangeText={onDraftChange}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            submitBehavior="newline"
            inputStyle={{ minHeight: 48, paddingVertical: 13 }}
          />
          {parsedDraft && parsedDraft.name ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              {parsedDraft.quantity !== null || parsedDraft.unit ? (
                <Chip label={amountLabel(parsedDraft.quantity, unitFor(parsedDraft.unit))} />
              ) : null}
              <Chip label={parsedDraft.name} />
              {parsedDraft.notes ? <Chip label={parsedDraft.notes} /> : null}
            </View>
          ) : null}
          {suggestionNames.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {suggestionNames.map((option) => (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityLabel={`Use ${option}`}
                  onPress={() => {
                    if (!parsedDraft) return
                    setLines((current) => [
                      ...current,
                      { ...parsedDraft, name: canonicalizeName(option), key: randomUUID() }
                    ])
                    setDraft('')
                  }}
                  style={{
                    minHeight: 36,
                    paddingHorizontal: 12,
                    borderRadius: 18,
                    borderWidth: 1.5,
                    borderColor: colors.line,
                    justifyContent: 'center'
                  }}
                >
                  <Text variant="label" tone="accent">
                    {option}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </FormSection>

        <Field
          label="Instructions"
          value={instructions}
          onChangeText={setInstructions}
          multiline
          placeholder={'1. Brown the turkey with the onion.\n2. Add everything else and simmer.'}
        />

        <FormSection title="Tags">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {tags.map((tag) => (
              <Chip key={tag} label={tag} />
            ))}
            <Pressable
              accessibilityRole="button"
              onPress={() => setTagging(true)}
              style={{
                minHeight: 34,
                paddingHorizontal: 12,
                borderRadius: 17,
                borderWidth: 1.5,
                borderStyle: 'dashed',
                borderColor: colors.ring,
                justifyContent: 'center'
              }}
            >
              <Text variant="captionStrong" tone="accent">
                {tags.length > 0 ? 'Edit tags' : '+ Tag'}
              </Text>
            </Pressable>
          </View>
        </FormSection>

        <Field
          label="Website"
          value={website}
          onChangeText={setWebsite}
          placeholder="seriouseats.com/…"
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Field label="Notes" value={notes} onChangeText={setNotes} multiline />

        {params.id ? (
          <ListLink
            danger
            label={confirmingDelete ? 'Tap again to delete this recipe' : 'Delete recipe'}
            onPress={() => {
              if (!confirmingDelete) return setConfirmingDelete(true)
              remove.mutate(recipeId, {
                onSuccess: () => {
                  toast({ message: `${name.trim()} deleted` })
                  router.replace('/recipes')
                },
                onError: (error) => toast({ message: error.message })
              })
            }}
          />
        ) : null}
      </ScrollView>

      <TagSheet
        visible={tagging}
        title="Tags"
        initial={tags}
        onClose={() => setTagging(false)}
        onSave={(next) => {
          setTags(next)
          setTagging(false)
        }}
      />
    </KeyboardAvoidingView>
  )
}
