import { describe, it, expect } from 'bun:test'
import { buildPlayerQueueFromRelease } from '@/player/queue'
import type { ReleaseEntry } from '@/types/content'

const mockRelease: ReleaseEntry = {
  slug: 'test-release',
  albumName: 'Test Release',
  sourceDirName: 'test-release',
  coverUrl: '/media/music/test-release/cover/cover.jpg',
  coverPreviewUrl: '/media/music/test-release/cover/cover-preview.webp',
  releaseDate: '15/03/2025',
  releaseType: 'ep',
  notes: 'Test notes',
  genre: { en: 'ambient', ru: 'амбиент' },
  playlistM3uUrl: null,
  playlistM3u8Url: null,
  previewPlaylistM3uUrl: null,
  previewPlaylistM3u8Url: null,
  tracks: [
    { index: 1, title: 'Intro', url: '/stream/1.m3u8', streamUrl: '/stream/1.m3u8', sourceUrl: null, previewUrl: null, duration: 60, sourceSampleRate: null, sourceBitDepth: null, links: { spotify: null, yandexMusic: null, bandcamp: null, soundcloud: null } },
    { index: 2, title: 'Main', url: '/stream/2.m3u8', streamUrl: '/stream/2.m3u8', sourceUrl: null, previewUrl: null, duration: 240, sourceSampleRate: null, sourceBitDepth: null, links: { spotify: null, yandexMusic: null, bandcamp: null, soundcloud: null } },
  ],
  links: { spotify: null, yandexMusic: null, bandcamp: null, soundcloud: null },
}

describe('buildPlayerQueueFromRelease', () => {
  it('builds queue with correct structure', () => {
    const queue = buildPlayerQueueFromRelease(mockRelease, 'en')
    expect(queue.queueKey).toBe('test-release')
    expect(queue.artist).toBe('')
    expect(queue.albumTitle).toBe('Test Release')
    expect(queue.coverUrl).toBe(mockRelease.coverPreviewUrl!)
    expect(queue.genre).toBe('ambient')
  })

  it('uses Russian genre when lang is ru', () => {
    const queue = buildPlayerQueueFromRelease(mockRelease, 'ru')
    expect(queue.genre).toBe('амбиент')
  })

  it('falls back to coverUrl when coverPreviewUrl is null', () => {
    const release = { ...mockRelease, coverPreviewUrl: null }
    const queue = buildPlayerQueueFromRelease(release, 'en')
    expect(queue.coverUrl).toBe('/media/music/test-release/cover/cover.jpg')
  })

  it('maps all tracks correctly', () => {
    const queue = buildPlayerQueueFromRelease(mockRelease, 'en')
    expect(queue.tracks).toHaveLength(2)
    expect(queue.tracks[0].index).toBe(1)
    expect(queue.tracks[0].title).toBe('Intro')
    expect(queue.tracks[0].url).toBe('/stream/1.m3u8')
    expect(queue.tracks[1].index).toBe(2)
    expect(queue.tracks[1].title).toBe('Main')
    expect(queue.tracks[1].duration).toBe(240)
  })

  it('preserves null fields in tracks', () => {
    const queue = buildPlayerQueueFromRelease(mockRelease, 'en')
    expect(queue.tracks[0].sourceUrl).toBeNull()
    expect(queue.tracks[0].previewUrl).toBeNull()
  })

  it('maps isMain flag onto queue tracks', () => {
    const release: ReleaseEntry = {
      ...mockRelease,
      tracks: mockRelease.tracks.map((t) => ({ ...t, isMain: t.index === 2 })),
    }
    const queue = buildPlayerQueueFromRelease(release, 'en')
    expect(queue.tracks[0].isMain).toBe(false)
    expect(queue.tracks[1].isMain).toBe(true)
  })

  it('filters locked tracks during pre-order while keeping original indices', () => {
    const release: ReleaseEntry = {
      ...mockRelease,
      releaseDate: '01/01/2099',
      tracks: [
        { index: 1, title: 'Locked', url: '/stream/1.m3u8', streamUrl: null, sourceUrl: null, previewUrl: null, duration: 60, sourceSampleRate: null, sourceBitDepth: null, links: { spotify: null, yandexMusic: null, bandcamp: null, soundcloud: null }, previewable: false },
        { index: 2, title: 'Open', url: '/stream/2.m3u8', streamUrl: null, sourceUrl: null, previewUrl: null, duration: 120, sourceSampleRate: null, sourceBitDepth: null, links: { spotify: null, yandexMusic: null, bandcamp: null, soundcloud: null }, previewable: true },
        { index: 3, title: 'AlsoLocked', url: '/stream/3.m3u8', streamUrl: null, sourceUrl: null, previewUrl: null, duration: 30, sourceSampleRate: null, sourceBitDepth: null, links: { spotify: null, yandexMusic: null, bandcamp: null, soundcloud: null }, previewable: false },
      ],
    }
    const queue = buildPlayerQueueFromRelease(release, 'en')
    expect(queue.tracks).toHaveLength(1)
    expect(queue.tracks[0].index).toBe(2)
    expect(queue.tracks[0].title).toBe('Open')
  })
})
