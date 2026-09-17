import { describe, it, expect } from 'bun:test'
import { setQueue } from '@/player/core/PlayerActions'
import { PlayerStateManager } from '@/player/core/PlayerState'
import type { PlayerEngine } from '@/player/core/PlayerEngine'
import type { GlobalPlayerQueue } from '@/player/types'

function makeTrack(index: number) {
  return {
    index,
    title: `Track ${index}`,
    url: `/stream/${index}.m3u8`,
    streamUrl: null,
    sourceUrl: null,
    previewUrl: null,
    duration: 60 * index,
    links: { spotify: null, yandexMusic: null, bandcamp: null, soundcloud: null },
  }
}

function makeQueue(slug: string, indices: number[]): GlobalPlayerQueue {
  return {
    queueKey: slug,
    artist: 'D7TUN6',
    albumTitle: slug,
    coverUrl: '/cover.jpg',
    releaseDate: '01/01/2025',
    genre: 'test',
    tracks: indices.map(makeTrack),
  }
}

function makeEngineStub(): PlayerEngine {
  return {
    pause() {},
    hlsManager: { destroy() {} },
    audioEngineManager: { streamOffset: 0 },
    loadBlank() {},
    lastPersistedPlaybackBucket: -1,
  } as unknown as PlayerEngine
}

describe('setQueue stale-queue handling', () => {
  it('keeps state untouched when the queue content is identical', () => {
    const state = new PlayerStateManager()
    const engine = makeEngineStub()
    const q = makeQueue('rel', [1, 2, 3])
    setQueue(state, engine, q)
    const first = state.state.queue
    state.setState({ currentIndex: 2 })

    setQueue(state, engine, makeQueue('rel', [1, 2, 3]))
    expect(state.state.queue).toBe(first)
    expect(state.state.currentIndex).toBe(2)
  })

  it('replaces a stale same-slug queue when availability changed and remaps the current track', () => {
    const state = new PlayerStateManager()
    const engine = makeEngineStub()
    // Old full queue (everything unlocked): user is on track index 8 → position 7.
    setQueue(state, engine, makeQueue('rel', Array.from({ length: 32 }, (_, i) => i + 1)))
    state.setState({ currentIndex: 7 })
    expect(state.state.queue?.tracks[7].index).toBe(8)

    // New filtered queue (only 4 tracks unlocked): track 8 is still available.
    const fresh = makeQueue('rel', [8, 12, 20, 31])
    setQueue(state, engine, fresh)

    expect(state.state.queue).toBe(fresh)
    expect(state.state.queue?.tracks).toHaveLength(4)
    // Current track carried over to its new position instead of silently pointing elsewhere.
    expect(state.state.currentIndex).toBe(0)
    expect(state.state.queue?.tracks[state.state.currentIndex].index).toBe(8)
  })

  it('falls back to the first track when the current one is no longer available', () => {
    const state = new PlayerStateManager()
    const engine = makeEngineStub()
    setQueue(state, engine, makeQueue('rel', [1, 2, 3]))
    state.setState({ currentIndex: 1 }) // track 2

    setQueue(state, engine, makeQueue('rel', [1, 3])) // track 2 got locked
    expect(state.state.queue?.tracks.map((t) => t.index)).toEqual([1, 3])
    expect(state.state.currentIndex).toBe(0)
    expect(state.state.playing).toBe(false)
  })

  it('starts a different release from scratch', () => {
    const state = new PlayerStateManager()
    const engine = makeEngineStub()
    setQueue(state, engine, makeQueue('a', [1, 2]))
    state.setState({ currentIndex: 1 })

    const other = makeQueue('b', [1, 2, 3])
    setQueue(state, engine, other)
    expect(state.state.queue).toBe(other)
    expect(state.state.currentIndex).toBe(0)
    expect(state.state.duration).toBe(60)
  })
})
