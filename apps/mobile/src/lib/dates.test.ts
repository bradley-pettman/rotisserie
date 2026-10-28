import { describe, expect, it } from 'vitest'
import { addMonths, monthGrid, monthLabel, startOfMonth } from './dates'

describe('startOfMonth', () => {
  it('returns the first of the month', () => {
    expect(startOfMonth('2026-10-28')).toBe('2026-10-01')
  })
})

describe('addMonths', () => {
  it.each([
    ['2026-10-28', 1, '2026-11-01'],
    ['2026-10-01', -1, '2026-09-01'],
    ['2026-12-15', 1, '2027-01-01'],
    ['2026-01-31', 1, '2026-02-01'],
    ['2026-03-31', -1, '2026-02-01']
  ])('moves %s by %i to %s', (iso, months, expected) => {
    expect(addMonths(iso, months)).toBe(expected)
  })
})

describe('monthLabel', () => {
  it('names the month and year', () => {
    expect(monthLabel('2026-10-28')).toBe('October 2026')
  })
})

describe('monthGrid', () => {
  it('covers whole weeks from Monday to Sunday', () => {
    const grid = monthGrid('2026-10-28')
    expect(grid[0]).toBe('2026-09-28')
    expect(grid.at(-1)).toBe('2026-11-01')
    expect(grid).toHaveLength(35)
  })

  it('grows to six weeks when the month needs them', () => {
    const grid = monthGrid('2026-08-01')
    expect(grid[0]).toBe('2026-07-27')
    expect(grid.at(-1)).toBe('2026-09-06')
    expect(grid).toHaveLength(42)
  })

  it('starts on the first when the month starts on a Monday', () => {
    expect(monthGrid('2027-02-10')[0]).toBe('2027-02-01')
    expect(monthGrid('2027-02-10')).toHaveLength(28)
  })
})
