import { describe, it, expect } from 'bun:test'
import { buildHeadCycle, NEUTRAL } from '@/components/player/playhead-cycle'

function parseAngle(transform: string): number {
  return Number(transform.match(/rotate\(([-\d.]+)deg\)/)![1])
}

function parseLift(transform: string): number {
  return Number(transform.match(/translateY\((-?[\d.]+)px\)/)![1])
}

describe('buildHeadCycle', () => {
  it('produces the four-phase idle sequence', () => {
    const cycle = buildHeadCycle(() => 0)
    expect(cycle.keyframes).toHaveLength(5)
    expect(cycle.keyframes[0]).toEqual({ transform: NEUTRAL, easing: 'ease-out', offset: 0 })
    expect(cycle.keyframes[1].easing).toBe('ease-in-out')
    expect(cycle.keyframes[2]).toEqual({ transform: NEUTRAL, easing: 'ease-out', offset: 0.5 })
    expect(cycle.keyframes[3].easing).toBe('ease-in-out')
    expect(cycle.keyframes[4]).toEqual({ transform: NEUTRAL, offset: 1 })
  })

  it('uses the low end of the ranges when random returns 0', () => {
    const cycle = buildHeadCycle(() => 0)
    expect(parseAngle(cycle.keyframes[1].transform)).toBe(15)
    expect(parseLift(cycle.keyframes[1].transform)).toBe(-10)
    expect(parseAngle(cycle.keyframes[3].transform)).toBe(-15)
    expect(cycle.duration).toBeCloseTo(1440)
    expect(cycle.pause).toBe(100)
    expect(cycle.keyframes.map((frame) => frame.offset)).toEqual([0, 0.25, 0.5, 0.75, 1])
  })

  it('uses the high end of the ranges when random returns 1', () => {
    const cycle = buildHeadCycle(() => 1)
    expect(parseAngle(cycle.keyframes[1].transform)).toBe(25)
    expect(parseLift(cycle.keyframes[1].transform)).toBe(-25)
    expect(parseAngle(cycle.keyframes[3].transform)).toBe(-25)
    expect(cycle.duration).toBeCloseTo(1760)
    expect(cycle.pause).toBe(200)
  })

  it('stays within spec ranges and keeps offsets monotonic', () => {
    for (let i = 0; i < 250; i += 1) {
      const cycle = buildHeadCycle()
      const right = parseAngle(cycle.keyframes[1].transform)
      const left = parseAngle(cycle.keyframes[3].transform)
      const lift = parseLift(cycle.keyframes[1].transform)
      expect(right).toBeGreaterThanOrEqual(15)
      expect(right).toBeLessThanOrEqual(25)
      expect(left).toBe(-right)
      expect(lift).toBeGreaterThanOrEqual(-25)
      expect(lift).toBeLessThanOrEqual(-10)
      expect(cycle.duration).toBeGreaterThanOrEqual(1440)
      expect(cycle.duration).toBeLessThanOrEqual(1760)
      expect(cycle.pause).toBeGreaterThanOrEqual(100)
      expect(cycle.pause).toBeLessThanOrEqual(200)
      const offsets = cycle.keyframes.map((frame) => frame.offset)
      for (let j = 1; j < offsets.length; j += 1) {
        expect(offsets[j]).toBeGreaterThan(offsets[j - 1])
      }
    }
  })
})
