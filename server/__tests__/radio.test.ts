import { describe, it, expect } from 'bun:test'
import { listenerKey } from '../lib/radio/listener-tracker.js'
import { nearestOccurrence, shouldEstimateOverride, shouldResetOverrun } from '../lib/radio/now-playing.js'
import type { NowPlayingEntry } from '../lib/radio/stream-generator.js'

function np(partial: Partial<NowPlayingEntry>): NowPlayingEntry {
  return {
    title: 't', album: 'a', artist: 'd7tun6', coverUrl: null,
    startTimestamp: Date.now(), duration: 120, elapsed: 0,
    upcoming: [], source: 'live',
    ...partial,
  }
}

// simplified listener counter logic from server/routes/radio.ts
function createListenerCounter() {
  let listenerCount = 0
  return {
    get count() { return listenerCount },
    update(delta: number) {
      listenerCount = Math.max(0, listenerCount + delta)
      return { ok: true, listeners: listenerCount }
    },
    reset() { listenerCount = 0 },
  }
}

describe('radio listener counter', () => {
  it('starts at 0', () => {
    const counter = createListenerCounter()
    expect(counter.count).toBe(0)
  })

  it('increments with positive delta', () => {
    const counter = createListenerCounter()
    counter.update(1)
    expect(counter.count).toBe(1)
  })

  it('decrements with negative delta', () => {
    const counter = createListenerCounter()
    counter.update(5)
    counter.update(-1)
    expect(counter.count).toBe(4)
  })

  it('never goes below 0', () => {
    const counter = createListenerCounter()
    counter.update(-10)
    expect(counter.count).toBe(0)
  })

  it('handles multiple concurrent changes', () => {
    const counter = createListenerCounter()
    counter.update(3)
    counter.update(-1)
    counter.update(2)
    counter.update(-4)
    expect(counter.count).toBe(0)
  })

  it('returns correct response shape', () => {
    const counter = createListenerCounter()
    const result = counter.update(1)
    expect(result).toEqual({ ok: true, listeners: 1 })
  })
})

describe('listener key', () => {
  it('uses a stable client id when present, ignoring the address', () => {
    expect(listenerKey('tab-123', '1.1.1.1')).toBe('id:tab-123')
    expect(listenerKey('tab-123', '2.2.2.2')).toBe('id:tab-123')
  })

  it('trims whitespace around the id', () => {
    expect(listenerKey('  tab-123  ', '1.1.1.1')).toBe('id:tab-123')
  })

  it('falls back to the address for blank, missing or non-string ids', () => {
    expect(listenerKey(undefined, '1.1.1.1')).toBe('ip:1.1.1.1')
    expect(listenerKey('', '1.1.1.1')).toBe('ip:1.1.1.1')
    expect(listenerKey('   ', '1.1.1.1')).toBe('ip:1.1.1.1')
    expect(listenerKey(42, '1.1.1.1')).toBe('ip:1.1.1.1')
  })

  it('falls back to the address for absurdly long ids', () => {
    expect(listenerKey('x'.repeat(129), '1.1.1.1')).toBe('ip:1.1.1.1')
    expect(listenerKey('x'.repeat(128), '1.1.1.1')).toBe(`id:${'x'.repeat(128)}`)
  })
})

describe('now-playing estimate override', () => {
  it('seeds the estimate when there is no entry yet', () => {
    expect(shouldEstimateOverride(null)).toBe(true)
  })

  it('allows refreshing an existing estimate', () => {
    expect(shouldEstimateOverride(np({ source: 'estimated' }))).toBe(true)
  })

  it('never displaces a live-confirmed entry', () => {
    expect(shouldEstimateOverride(np({ source: 'live' }))).toBe(false)
  })
})

describe('now-playing overrun reset', () => {
  it('tolerates a track running well past its catalog duration', () => {
    const entry = np({ duration: 120 })
    // 200s = 80s over a 120s catalog duration — still fine.
    expect(shouldResetOverrun(entry, 200)).toBe(false)
  })

  it('resets only on a pathological overrun (~3x the catalog duration)', () => {
    const entry = np({ duration: 120 })
    expect(shouldResetOverrun(entry, 360)).toBe(false)
    expect(shouldResetOverrun(entry, 361)).toBe(true)
  })

  it('never resets an estimated entry', () => {
    expect(shouldResetOverrun(np({ source: 'estimated' }), 99999)).toBe(false)
  })

  it('never resets when there is no usable duration', () => {
    expect(shouldResetOverrun(np({ duration: 0 }), 99999)).toBe(false)
  })
})

describe('now-playing sequential occurrence pick', () => {
  it('picks the single occurrence', () => {
    expect(nearestOccurrence([3], 10, 100)).toBe(3)
  })

  it('picks the instance nearest the current airplay position', () => {
    // title airs at slots 2 and 90, round is 100 long, anchor is slot 5 → 2.
    expect(nearestOccurrence([2, 90], 5, 100)).toBe(2)
  })

  it('wraps around the round boundary', () => {
    // anchor near the end (slot 95): slot 90 is the closest occurrence.
    expect(nearestOccurrence([2, 90], 95, 100)).toBe(90)
    // anchor one slot from the end: wrapping to the head (slot 2) wins.
    expect(nearestOccurrence([2, 90], 99, 100)).toBe(2)
  })

  it('handles ties deterministically (first in list)', () => {
    expect(nearestOccurrence([5, 5], 5, 100)).toBe(5)
  })

  it('returns -1 for an empty candidate list', () => {
    expect(nearestOccurrence([], 0, 100)).toBe(-1)
  })
})
