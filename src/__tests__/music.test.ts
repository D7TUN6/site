import { describe, it, expect } from 'bun:test'
import { getMusicTag, getMusicTagLabel, groupMusicReleasesByTag, compareReleasesByDateDesc, MUSIC_TAG_ORDER } from '@/lib/music'
import type { ReleaseEntry } from '@/types/content'

function makeRelease(overrides: Partial<ReleaseEntry> & { slug: string; albumName: string; trackCount?: number }): ReleaseEntry {
  const count = overrides.trackCount ?? 4
  return {
    slug: overrides.slug,
    albumName: overrides.albumName,
    sourceDirName: overrides.slug,
    coverUrl: `/media/music/${overrides.slug}/cover/cover.jpg`,
    coverPreviewUrl: `/media/music/${overrides.slug}/cover/cover-preview.webp`,
    releaseDate: '01/01/2025',
    releaseType: null,
    notes: '',
    genre: { en: 'electronic', ru: 'электроника' },
    playlistM3uUrl: null,
    playlistM3u8Url: null,
    previewPlaylistM3uUrl: null,
    previewPlaylistM3u8Url: null,
    tracks: Array.from({ length: count }, (_, i) => ({
      index: i + 1,
      title: `Track ${i + 1}`,
      url: `/media/music/${overrides.slug}/tracks/stream/${i + 1}.m3u8`,
      streamUrl: `/media/music/${overrides.slug}/tracks/stream/${i + 1}.m3u8`,
      sourceUrl: null,
      previewUrl: null,
      duration: 180,
      sourceSampleRate: null,
      sourceBitDepth: null,
      links: { spotify: null, yandexMusic: null, bandcamp: null, soundcloud: null },
    })),
    links: { spotify: null, yandexMusic: null, bandcamp: null, soundcloud: null },
  }
}

describe('getMusicTag', () => {
  it('returns "remaster" for deluxe edition', () => {
    expect(getMusicTag(makeRelease({ slug: 'test', albumName: 'Test Deluxe' }))).toBe('remaster')
  })

  it('returns "remaster" when slug contains "deluxe"', () => {
    expect(getMusicTag(makeRelease({ slug: 'test-deluxe', albumName: 'Test' }))).toBe('remaster')
  })

  it('returns "remaster" for remaster in album name', () => {
    expect(getMusicTag(makeRelease({ slug: 'test', albumName: 'Remastered Edition' }))).toBe('remaster')
  })

  it('returns "lp" for wh1te-hous3', () => {
    expect(getMusicTag(makeRelease({ slug: 'wh1te-hous3', albumName: 'Wh1te Hous3', trackCount: 1 }))).toBe('lp')
  })

  it('returns "ep" for a-path-of-static-snow', () => {
    expect(getMusicTag(makeRelease({ slug: 'a-path-of-static-snow', albumName: 'A Path of Static Snow', trackCount: 1 }))).toBe('ep')
  })

  it('returns "ep" for b-twin', () => {
    expect(getMusicTag(makeRelease({ slug: 'b-twin', albumName: 'B TWIN', trackCount: 1 }))).toBe('ep')
  })

  it('returns "single" for single-track releases', () => {
    const release = makeRelease({ slug: 'test-single', albumName: 'Test Single', trackCount: 1 })
    expect(getMusicTag(release)).toBe('single')
  })

  it('returns "ep" for 2-4 track releases', () => {
    expect(getMusicTag(makeRelease({ slug: 'test-ep', albumName: 'Test EP', trackCount: 2 }))).toBe('ep')
    expect(getMusicTag(makeRelease({ slug: 'test-ep3', albumName: 'Test EP 3', trackCount: 3 }))).toBe('ep')
    expect(getMusicTag(makeRelease({ slug: 'test-ep4', albumName: 'Test EP 4', trackCount: 4 }))).toBe('ep')
  })

  it('returns "lp" for 5+ track releases', () => {
    expect(getMusicTag(makeRelease({ slug: 'test-lp', albumName: 'Test LP', trackCount: 5 }))).toBe('lp')
    expect(getMusicTag(makeRelease({ slug: 'test-lp10', albumName: 'Test LP', trackCount: 10 }))).toBe('lp')
  })

  it('prioritizes slug override over track count', () => {
    const release = makeRelease({ slug: 'wh1te-hous3', albumName: 'Wh1te Hous3', trackCount: 1 })
    expect(getMusicTag(release)).toBe('lp')
  })
})

describe('getMusicTagLabel', () => {
  it('returns correct label for each tag', () => {
    expect(getMusicTagLabel('lp')).toBe('LP')
    expect(getMusicTagLabel('ep')).toBe('EP')
    expect(getMusicTagLabel('single')).toBe('Single')
    expect(getMusicTagLabel('remaster')).toBe('Remaster')
  })
})

describe('groupMusicReleasesByTag', () => {
  it('groups releases by tag in defined order', () => {
    const single = makeRelease({ slug: 'a', albumName: 'Single', trackCount: 1 })
    const lp = makeRelease({ slug: 'b', albumName: 'LP', trackCount: 6 })
    const ep = makeRelease({ slug: 'c', albumName: 'EP', trackCount: 3 })
    const groups = groupMusicReleasesByTag([single, lp, ep])
    expect(groups.map(g => g.tag)).toEqual(['lp', 'ep', 'single', 'remaster'])
    expect(groups.find(g => g.tag === 'single')!.releases).toHaveLength(1)
    expect(groups.find(g => g.tag === 'lp')!.releases).toHaveLength(1)
    expect(groups.find(g => g.tag === 'ep')!.releases).toHaveLength(1)
    expect(groups.find(g => g.tag === 'remaster')!.releases).toHaveLength(0)
  })

  it('returns empty arrays for all tags when no releases', () => {
    const groups = groupMusicReleasesByTag([])
    expect(groups).toHaveLength(4)
    expect(groups.every(g => g.releases.length === 0)).toBe(true)
  })

  it('handles releases in correct tag order', () => {
    const groups = groupMusicReleasesByTag([])
    expect(groups.map(g => g.tag)).toEqual(MUSIC_TAG_ORDER)
  })
})

describe('compareReleasesByDateDesc', () => {
  it('sorts by date descending', () => {
    const a = makeRelease({ slug: 'old', albumName: 'Old', releaseDate: '01/01/2023' })
    const b = makeRelease({ slug: 'new', albumName: 'New', releaseDate: '01/01/2025' })
    expect(compareReleasesByDateDesc(a, b)).toBeGreaterThan(0)
    expect(compareReleasesByDateDesc(b, a)).toBeLessThan(0)
  })

  it('sorts alphabetically when dates are equal', () => {
    const a = makeRelease({ slug: 'alpha', albumName: 'Alpha' })
    const b = makeRelease({ slug: 'beta', albumName: 'Beta' })
    expect(compareReleasesByDateDesc(a, b)).toBeLessThan(0)
    expect(compareReleasesByDateDesc(b, a)).toBeGreaterThan(0)
  })

  it('handles invalid date gracefully', () => {
    const a = makeRelease({ slug: 'a', albumName: 'A', releaseDate: 'invalid' })
    const b = makeRelease({ slug: 'b', albumName: 'B', releaseDate: '01/01/2025' })
    expect(typeof compareReleasesByDateDesc(a, b)).toBe('number')
  })
})
