import z from 'zod'
import { UnitSchemas } from '../base'
import type { InferSchemas } from '../lib/schemas'
import { GrocerySection } from './sections'

const GroceryAmount = z.object({
  quantity: z.number().nullable(),
  unit: UnitSchemas.Unit.nullable()
})

const GroceryLine = z.object({
  key: z.string(),
  ingredientId: z.string().nullable(),
  name: z.string(),
  amounts: GroceryAmount.array(),
  dishes: z.string().array(),
  meals: z.string().array()
})

const GroceryItem = z.object({
  id: z.string(),
  text: z.string(),
  checked: z.boolean(),
  sortOrder: z.number(),
  storeId: z.string().nullable(),
  section: GrocerySection.nullable(),
  dishes: z.string().array(),
  mealIds: z.string().array(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
})

const GroceryItemInput = z.object({
  id: z.uuid(),
  text: z.string().trim().min(1).max(500),
  checked: z.boolean().default(false),
  sortOrder: z.number().finite(),
  storeId: z.uuid().nullable().optional(),
  section: GrocerySection.nullable().optional()
})

const GroceryStore = z.object({
  id: z.string(),
  name: z.string(),
  sortOrder: z.number()
})

const GroceryStoreInput = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(100),
  sortOrder: z.number().finite()
})

const GroceryAlert = z.object({
  id: z.string(),
  plannedMealId: z.string().nullable(),
  label: z.string(),
  kind: z.enum(['changed', 'removed']),
  added: GroceryLine.array(),
  removed: GroceryLine.array(),
  changed: z.object({ before: GroceryLine, after: GroceryLine }).array(),
  increase: GroceryLine.array()
})

const GroceryList = z.object({
  items: GroceryItem.array(),
  alerts: GroceryAlert.array(),
  stores: GroceryStore.array(),
  meals: z.object({ plannedMealId: z.string(), label: z.string(), addedAt: z.iso.datetime() }).array()
})

const PreviewInput = z.object({
  plannedMealIds: z.uuid().array().min(1).max(60)
})

const PreviewLine = GroceryLine.extend({
  onList: z.string().nullable()
})

const GroceryPreview = z.object({
  lines: PreviewLine.array()
})

const ImportInput = PreviewInput.extend({
  excludeKeys: z.string().max(300).array().max(500).default([])
})

export const GrocerySchemas = {
  GroceryAmount,
  GroceryLine,
  GroceryItem,
  GroceryItemInput,
  GroceryStore,
  GroceryStoreInput,
  GroceryAlert,
  GroceryList,
  PreviewInput,
  PreviewLine,
  GroceryPreview,
  ImportInput
}

export type GrocerySchemas = InferSchemas<typeof GrocerySchemas>
