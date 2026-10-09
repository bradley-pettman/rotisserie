import z from 'zod'
import type { InferSchemas } from '../lib/schemas'

const UnitRaw = z.object({
  id: z.string(),
  name: z.string(),
  abbreviation: z.string().nullable(),
  category: z.enum(['volume', 'weight', 'count', 'other'])
})

const Unit = UnitRaw

export const UnitSchemas = {
  UnitRaw,
  Unit
}

export type UnitSchemas = InferSchemas<typeof UnitSchemas>
