import { describe, it, expect } from 'bun:test'
import { parseFrontmatter } from '../lib/frontmatter.js'

describe('video parseFrontmatter', () => {
  it('parses title, date, duration, thumbnail', () => {
    const input = `---
title: "My Video"
date: "2025-06-01"
duration: 120
thumbnail: thumb.jpg
---
Content`
    const attrs = parseFrontmatter(input)
    expect(attrs.title).toBe('My Video')
    expect(attrs.date).toBe('2025-06-01')
    expect(attrs.duration).toBe(120)
    expect(attrs.thumbnail).toBe('thumb.jpg')
  })

  it('parses sources section', () => {
    const input = `---
title: "Video with sources"
date: "2025-06-01"
sources:
  - url: /media/video/test/video.mp4, type: video/mp4, resolution: 1080p
  - url: /media/video/test/video.webm, type: video/webm, resolution: 720p
---
Body`
    const attrs = parseFrontmatter(input)
    expect(Array.isArray(attrs.sources)).toBe(true)
    const sources = attrs.sources as Array<Record<string, string>>
    expect(sources).toHaveLength(2)
    expect(sources[0].url).toBe('/media/video/test/video.mp4')
    expect(sources[0].type).toBe('video/mp4')
    expect(sources[0].resolution).toBe('1080p')
    expect(sources[1].url).toBe('/media/video/test/video.webm')
    expect(sources[1].type).toBe('video/webm')
  })

  it('handles missing frontmatter', () => {
    expect(parseFrontmatter('Just content')).toEqual({})
  })

  it('parses boolean and numeric values', () => {
    const input = `---
featured: true
year: 2025
---
Body`
    const attrs = parseFrontmatter(input)
    expect(attrs.featured).toBe(true)
    expect(attrs.year).toBe(2025)
  })

  it('handles sources with different fields', () => {
    const input = `---
title: Test
date: "2025-01-01"
sources:
  - url: /v/a.mp4, type: video/mp4
  - url: /v/b.mp4, type: video/mp4, resolution: 4k
---
Body`
    const attrs = parseFrontmatter(input)
    const sources = attrs.sources as Array<Record<string, string>>
    expect(sources).toHaveLength(2)
    expect(sources[0].resolution).toBeUndefined()
    expect(sources[1].resolution).toBe('4k')
  })

  it('parses multi-line sources format', () => {
    const input = `---
title: HLS Test
date: "2025-06-01"
sources:
  - url: /media/video/test/videos/hls/index.m3u8
    type: application/vnd.apple.mpegurl
---
Body`
    const attrs = parseFrontmatter(input)
    const sources = attrs.sources as Array<Record<string, string>>
    expect(sources).toHaveLength(1)
    expect(sources[0].url).toBe('/media/video/test/videos/hls/index.m3u8')
    expect(sources[0].type).toBe('application/vnd.apple.mpegurl')
  })
})
