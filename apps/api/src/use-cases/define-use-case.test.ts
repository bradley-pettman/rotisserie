import { describe, expect, it } from 'vitest'
import z from 'zod'
import { defineUseCase } from './define-use-case'

const Double = defineUseCase({
  input: z.object({ value: z.coerce.number() }),
  output: z.object({ doubled: z.number().max(100) }),
  implementation: async ({ value }) => ({ doubled: value * 2 })
})

const Greet = defineUseCase({
  actor: z.object({ name: z.string().min(1) }),
  input: z.object({ greeting: z.string() }),
  output: z.string(),
  implementation: async ({ greeting }, { name }) => `${greeting}, ${name}`
})

describe('defineUseCase with an actor', () => {
  it('passes the parsed actor after the input', async () => {
    expect(await Greet({ greeting: 'Hello' }, { name: 'Sam' })).toBe('Hello, Sam')
  })

  it('rejects an invalid actor before the implementation runs', async () => {
    await expect(Greet({ greeting: 'Hello' }, { name: '' })).rejects.toBeInstanceOf(z.core.$ZodError)
  })

  it('exposes its actor schema', () => {
    expect(Greet.actor.shape.name).toBeDefined()
  })
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
