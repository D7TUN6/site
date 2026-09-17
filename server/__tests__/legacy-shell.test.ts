import { describe, it, expect } from 'bun:test'
import { buildLegacyReleasePage, extractReleaseSlug } from '../lib/legacy-shell.js'

describe('extractReleaseSlug', () => {
  it('parses /music/<slug>', () => {
    expect(extractReleaseSlug('/music/a-path-of-static-snow')).toBe('a-path-of-static-snow')
  })
  it('parses language-prefixed release routes', () => {
    expect(extractReleaseSlug('/en/music/a-path-of-static-snow')).toBe('a-path-of-static-snow')
    expect(extractReleaseSlug('/ru/music/b-twin')).toBe('b-twin')
  })
  it('ignores tag and non-release routes', () => {
    expect(extractReleaseSlug('/music/tag/dark')).toBe(null)
    expect(extractReleaseSlug('/music')).toBe(null)
    expect(extractReleaseSlug('/')).toBe(null)
    expect(extractReleaseSlug('/shop')).toBe(null)
  })
})

describe('buildLegacyReleasePage', () => {
  const base = {
    level: 'level-1' as const,
    siteName: 'D7TUN6',
    lang: 'en' as const,
    musicBackUrl: '/music',
    release: {
      slug: 'a-path-of-static-snow',
      albumName: 'A Path of Static Snow',
      artist: 'D7TUN6',
      releaseDate: '17/12/2025',
      releaseType: 'album',
      coverUrl: '/media/music/A Path of Static Snow/cover/cover.jpg',
      notes: '### about\n\nfirst release',
      playlistM3uUrl: '/media/music/A Path of Static Snow/playlists/full.m3u',
      tracks: [
        { index: 2, title: 'Crying Witches', duration: 281, sourceUrl: '/media/x/2__Crying Witches.wav', previewUrl: '/media/x/preview/crying-witches.ogg' },
        { index: 1, title: 'Acid Tears', duration: 104.57 },
      ],
    },
  }

  it('renders album title, nav, notes and escape-outs user text', () => {
    const { html } = buildLegacyReleasePage(base)
    expect(html).toContain('<h1>A Path of Static Snow</h1>')
    expect(html).toContain('Crying Witches')
    expect(html).toContain('<h3>about</h3>')
    expect(html).toContain('<p>first release</p>')
    expect(html).not.toContain('<script')
  })

  it('sorts tracks by index and emits audio + download links', () => {
    const { html } = buildLegacyReleasePage(base)
    const acid = html.indexOf('1. Acid Tears')
    const crying = html.indexOf('2. Crying Witches')
    expect(acid).toBeGreaterThan(-1)
    expect(crying).toBeGreaterThan(acid)
    expect(html).toContain('<audio controls preload="none">')
    expect(html).toContain('type="audio/wav"')
    expect(html).toContain('type="audio/ogg"')
    expect(html).toContain('download WAV (full)')
    expect(html).toContain('playlist (m3u)')
    expect(html).toContain('Back to releases')
  })

  it('formats track durations', () => {
    const { html } = buildLegacyReleasePage(base)
    expect(html).toContain('(04:41)')
    expect(html).toContain('(01:45)')
  })
})