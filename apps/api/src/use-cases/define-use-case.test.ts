import { describe, expect, it } from 'vitest'
import z from 'zod'
import { defineUseCase } from './define-use-case'

const Double = defineUseCase({
  input: z.object({ value: z.coerce.number() }),
  output: z.object({ doubled: z.number().max(100) }),
  implementation: async ({ value }) => ({ doubled: value * 2 })
})

describe('defineUseCase', () => {
  it('passes the parsed input to the implementation', async () => {
    expect(await Double({ value: '4' })).toEqual({ doubled: 8 })
  })

  it('rejects invalid input before the implementation runs', async () => {
    await expect(Double({ value: 'four' })).rejects.toBeInstanceOf(z.core.$ZodError)
  })

  it('rejects output that breaks the contract', async () => {
    await expect(Double({ value: 51 })).rejects.toBeInstanceOf(z.core.$ZodError)
  })

  it('exposes its schemas', () => {
    expect(Double.input.shape.value).toBeDefined()
    expect(Double.output.shape.doubled).toBeDefined()
  })
})
