import { describe, it, expect } from 'vitest'
import { clamp, buildSequentialOrder, buildShuffledOrder } from '@/player/order'

describe('clamp', () => {
  it('clamps value below min', () => {
    expect(clamp(-5, 0, 10)).toBe(0)
  })

  it('clamps value above max', () => {
    expect(clamp(15, 0, 10)).toBe(10)
  })

  it('returns value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
  })

  it('handles negative ranges', () => {
    expect(clamp(-10, -20, -5)).toBe(-10)
    expect(clamp(-30, -20, -5)).toBe(-20)
    expect(clamp(0, -20, -5)).toBe(-5)
  })

  it('handles zero-width range', () => {
    expect(clamp(5, 5, 5)).toBe(5)
  })
})

describe('buildSequentialOrder', () => {
  it('returns sequential indices', () => {
    expect(buildSequentialOrder(5)).toEqual([0, 1, 2, 3, 4])
  })

  it('returns empty array for total 0', () => {
    expect(buildSequentialOrder(0)).toEqual([])
  })

  it('returns single element for total 1', () => {
    expect(buildSequentialOrder(1)).toEqual([0])
  })
})

describe('buildShuffledOrder', () => {
  it('returns all indices in shuffled order', () => {
    const result = buildShuffledOrder(5)
    expect(result).toHaveLength(5)
    expect(result.sort()).toEqual([0, 1, 2, 3, 4])
  })

  it('returns empty array for total 0', () => {
    expect(buildShuffledOrder(0)).toEqual([])
  })

  it('returns empty array for negative total', () => {
    expect(buildShuffledOrder(-1)).toEqual([])
  })

  it('starts with firstIndex when provided', () => {
    const result = buildShuffledOrder(5, 2)
    expect(result[0]).toBe(2)
    expect(result).toHaveLength(5)
    expect(result.sort()).toEqual([0, 1, 2, 3, 4])
  })

  it('handles firstIndex 0', () => {
    const result = buildShuffledOrder(3, 0)
    expect(result[0]).toBe(0)
    expect(result).toHaveLength(3)
    expect(result.sort()).toEqual([0, 1, 2])
  })

  it('handles firstIndex at last position', () => {
    const result = buildShuffledOrder(3, 2)
    expect(result[0]).toBe(2)
    expect(result).toHaveLength(3)
    expect(result.sort()).toEqual([0, 1, 2])
  })

  it('ignores invalid firstIndex (negative)', () => {
    const result = buildShuffledOrder(5, -1)
    expect(result).toHaveLength(5)
    expect(result.sort()).toEqual([0, 1, 2, 3, 4])
  })

  it('ignores firstIndex out of range', () => {
    const result = buildShuffledOrder(5, 10)
    expect(result).toHaveLength(5)
    expect(result.sort()).toEqual([0, 1, 2, 3, 4])
  })

  it('shuffles the rest after firstIndex', () => {
    for (let i = 0; i < 50; i++) {
      const result = buildShuffledOrder(5, 1)
      expect(result[0]).toBe(1)
      expect(result).toHaveLength(5)
      const rest = result.slice(1)
      expect(rest.sort()).toEqual([0, 2, 3, 4])
    }
  })

  it('shuffling does not modify original order', () => {
    const first = buildShuffledOrder(10)
    const second = buildShuffledOrder(10)
    expect(first).toHaveLength(10)
    expect(second).toHaveLength(10)
    expect(first.sort()).toEqual(second.sort())
  })
})
