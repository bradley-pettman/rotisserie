import { describe, expect, it } from 'vitest'
import { NotFoundError, strict } from './errors'

const findName = async (id: string): Promise<{ name: string } | null> => (id === 'known' ? { name: 'Meatloaf' } : null)

describe('strict', () => {
  it('returns the result when there is one', async () => {
    expect(await strict(findName, 'Recipe')('known')).toEqual({ name: 'Meatloaf' })
  })

  it('throws NotFoundError naming the entity when there is none', async () => {
    const lookup = strict(findName, 'Recipe')('missing')

    await expect(lookup).rejects.toBeInstanceOf(NotFoundError)
    await expect(lookup).rejects.toThrow('Recipe not found')
  })
})
