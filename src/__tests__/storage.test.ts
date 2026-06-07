
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { readPersistedPlayerState, writePersistedPlayerState, clearPersistedPlayerState, PLAYER_STORAGE_KEY } from '@/player/storage'
import type { PersistedPlayerState } from '@/player/storage'

const mockState: PersistedPlayerState = {
  queueKey: 'test-release',
  currentIndex: 2,
  currentTime: 45.5,
  volume: 0.8,
  muted: false,
  shuffleEnabled: true,
  repeatMode: 'all',
  hasStartedPlayback: true,
  playOrder: [0, 1, 2, 3],
  orderPos: 1,
  wasPlaying: true,
}

beforeEach(() => {
  if (typeof window !== 'undefined') {
    window.localStorage.clear()
  }
})

describe('readPersistedPlayerState', () => {
  it('returns null when window is undefined', () => {
    const { window: _win } = globalThis
    const origWindow = globalThis.window
    delete (globalThis as any).window
    expect(readPersistedPlayerState()).toBeNull()
    ;(globalThis as any).window = origWindow
  })

  it('returns null when no stored state', () => {
    expect(readPersistedPlayerState()).toBeNull()
  })

  it('returns parsed state when valid JSON is stored', () => {
    window.localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(mockState))
    const result = readPersistedPlayerState()
    expect(result).toEqual(mockState)
  })

  it('returns null when stored value is not valid JSON', () => {
    window.localStorage.setItem(PLAYER_STORAGE_KEY, 'not-json')
    expect(readPersistedPlayerState()).toBeNull()
  })
})

describe('writePersistedPlayerState', () => {
  it('writes state to localStorage', () => {
    writePersistedPlayerState(mockState)
    const stored = window.localStorage.getItem(PLAYER_STORAGE_KEY)
    expect(stored).toBe(JSON.stringify(mockState))
  })

  it('removes item when state is null', () => {
    window.localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(mockState))
    writePersistedPlayerState(null)
    expect(window.localStorage.getItem(PLAYER_STORAGE_KEY)).toBeNull()
  })

  it('does not throw when window is undefined', () => {
    const origWindow = globalThis.window
    delete (globalThis as any).window
    expect(() => writePersistedPlayerState(mockState)).not.toThrow()
    ;(globalThis as any).window = origWindow
  })
})

describe('clearPersistedPlayerState', () => {
  it('removes the storage key', () => {
    window.localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(mockState))
    clearPersistedPlayerState()
    expect(window.localStorage.getItem(PLAYER_STORAGE_KEY)).toBeNull()
  })

  it('does not throw when already empty', () => {
    expect(() => clearPersistedPlayerState()).not.toThrow()
  })

  it('does not throw when window is undefined', () => {
    const origWindow = globalThis.window
    delete (globalThis as any).window
    expect(() => clearPersistedPlayerState()).not.toThrow()
    ;(globalThis as any).window = origWindow
  })
})
