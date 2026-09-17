import { describe, it, expect } from 'bun:test'
import { parseFrontmatter } from '../lib/frontmatter.js'

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
