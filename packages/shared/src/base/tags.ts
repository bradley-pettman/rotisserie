import z from 'zod'
import type { InferSchemas } from '../lib/schemas'

const TagRaw = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.iso.datetime()
})

const Tag = TagRaw

export const TagSchemas = {
  TagRaw,
  Tag
}

export type TagSchemas = InferSchemas<typeof TagSchemas>
