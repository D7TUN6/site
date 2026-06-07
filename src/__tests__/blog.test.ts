import { describe, it, expect } from 'vitest'
import { parseFrontmatter } from '@/lib/blog'

describe('parseFrontmatter', () => {
  it('parses frontmatter with multiple fields', () => {
    const input = `---
title: Hello World
slug: hello-world
publishedAt: 01/01/2025
excerpt: A short excerpt
---
Content body here`
    const result = parseFrontmatter(input)
    expect(result.data.title).toBe('Hello World')
    expect(result.data.slug).toBe('hello-world')
    expect(result.data.publishedAt).toBe('01/01/2025')
    expect(result.data.excerpt).toBe('A short excerpt')
    expect(result.content).toBe('Content body here')
  })

  it('handles content without frontmatter', () => {
    const result = parseFrontmatter('Just content')
    expect(result.data).toEqual({})
    expect(result.content).toBe('Just content')
  })

  it('handles empty string', () => {
    const result = parseFrontmatter('')
    expect(result.data).toEqual({})
    expect(result.content).toBe('')
  })

  it('handles frontmatter only without body', () => {
    const input = `---
title: Only Frontmatter
---
`
    const result = parseFrontmatter(input)
    expect(result.data.title).toBe('Only Frontmatter')
    expect(result.content).toBe('')
  })

  it('handles quoted values', () => {
    const input = `---
title: "Quoted Title"
---
Body`
    const result = parseFrontmatter(input)
    expect(result.data.title).toBe('Quoted Title')
  })

  it('handles single-quoted values', () => {
    const input = `---
title: 'Single Quoted'
---
Body`
    const result = parseFrontmatter(input)
    expect(result.data.title).toBe('Single Quoted')
  })

  it('strips BOM character', () => {
    const input = `\uFEFF---
title: BOM Test
---
Body`
    const result = parseFrontmatter(input)
    expect(result.data.title).toBe('BOM Test')
    expect(result.content).toBe('Body')
  })

  it('handles multiline body', () => {
    const input = `---
title: Multi
---
Line 1
Line 2
Line 3`
    const result = parseFrontmatter(input)
    expect(result.data.title).toBe('Multi')
    expect(result.content).toBe('Line 1\nLine 2\nLine 3')
  })

  it('handles missing closing delimiter', () => {
    const input = `---
title: No Close
Body text`
    const result = parseFrontmatter(input)
    expect(result.data).toEqual({})
    expect(result.content).toBe('---\ntitle: No Close\nBody text')
  })

  it('handlines lines without colon separator', () => {
    const input = `---
title: Valid
invalid-line-without-colon
---
Body`
    const result = parseFrontmatter(input)
    expect(result.data.title).toBe('Valid')
    expect(result.content).toBe('Body')
  })

  it('trims whitespace from values', () => {
    const input = `---
title:   Spaced Title   
---
Body`
    const result = parseFrontmatter(input)
    expect(result.data.title).toBe('Spaced Title')
  })
})
