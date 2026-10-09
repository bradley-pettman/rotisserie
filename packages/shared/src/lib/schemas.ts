import z from 'zod'

export type InferSchemas<T extends Record<string, z.ZodType>> = { [K in keyof T]: z.output<T[K]> }
