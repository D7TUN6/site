import { describe, it, expect } from 'vitest'

// parseFrontmatter from server/routes/gallery.ts (inline for testability)
function parseFrontmatter(raw: string): Record<string, unknown> {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/)
  if (!match) return {}
  const body = match[1]
  const attrs: Record<string, unknown> = {}
  for (const line of body.split('\n')) {
    const sep = line.indexOf(':')
    if (sep === -1) continue
    const key = line.slice(0, sep).trim()
    let rawVal: string = line.slice(sep + 1).trim()
    let val: unknown = rawVal.replace(/^["']|["']$/g, '')
    if (rawVal === 'true') val = true
    else if (rawVal === 'false') val = false
    else if (/^\d+$/.test(rawVal)) val = Number(rawVal)
    else if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
      val = rawVal.slice(1, -1).split(',').map((s: string) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
    }
    attrs[key] = val
  }
  return attrs
}

describe('gallery parseFrontmatter', () => {
  it('parses title, date, tags, images, cover', () => {
    const input = `---
title: "My Gallery"
date: "2025-06-01"
tags: [concert, live]
images: [img1.jpg, img2.jpg]
cover: img1.jpg
---
Some description`
    const attrs = parseFrontmatter(input)
    expect(attrs.title).toBe('My Gallery')
    expect(attrs.date).toBe('2025-06-01')
    expect(attrs.tags).toEqual(['concert', 'live'])
    expect(attrs.images).toEqual(['img1.jpg', 'img2.jpg'])
    expect(attrs.cover).toBe('img1.jpg')
  })

  it('handles missing frontmatter', () => {
    expect(parseFrontmatter('Just content')).toEqual({})
  })

  it('handles empty string', () => {
    expect(parseFrontmatter('')).toEqual({})
  })

  it('parses boolean values', () => {
    const input = `---
featured: true
hidden: false
---
Body`
    const attrs = parseFrontmatter(input)
    expect(attrs.featured).toBe(true)
    expect(attrs.hidden).toBe(false)
  })

  it('parses numeric values', () => {
    const input = `---
year: 2025
---
Body`
    const attrs = parseFrontmatter(input)
    expect(attrs.year).toBe(2025)
  })

  it('returns empty object for frontmatter-only without body', () => {
    const input = `---
title: Test
---`
    const attrs = parseFrontmatter(input)
    expect(attrs.title).toBe('Test')
  })

  it('skips lines without colon', () => {
    const input = `---
title: Valid
  invalid-line-no-colon
---
Body`
    const attrs = parseFrontmatter(input)
    expect(attrs.title).toBe('Valid')
    expect(attrs['invalid-line-no-colon']).toBeUndefined()
  })
})
