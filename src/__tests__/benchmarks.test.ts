import { describe, it, expect } from 'vitest'
import { renderSimpleMarkdown } from '@/lib/simpleMarkdown'
import { buildShuffledOrder } from '@/player/order'
import { parseFrontmatter } from '@/lib/blog'

describe('benchmark smoke tests — verify functions handle large inputs', () => {
  it('buildShuffledOrder handles large total', () => {
    const result = buildShuffledOrder(1000)
    expect(result).toHaveLength(1000)
    expect(result.sort((a, b) => a - b)).toEqual(Array.from({ length: 1000 }, (_, i) => i))
  })

  it('buildShuffledOrder handles large total with firstIndex', () => {
    const result = buildShuffledOrder(1000, 500)
    expect(result[0]).toBe(500)
    expect(result).toHaveLength(1000)
  })

  it('buildShuffledOrder handles edge cases', () => {
    expect(buildShuffledOrder(0)).toEqual([])
    expect(buildShuffledOrder(1)).toEqual([0])
  })

  it('renderSimpleMarkdown handles large content with headings lists and paragraphs', () => {
    const input = Array.from({ length: 100 }, (_, i) => {
      if (i % 5 === 0) return `## Section ${i / 5 + 1}`
      if (i % 3 === 0) return `- List item **${i}** with [link](https:////example.com)`
      return `Paragraph number ${i} with some **bold** content.`
    }).join('\n\n')
    const result = renderSimpleMarkdown(input)
    expect(result).toContain('<h2>')
    expect(result).toContain('<li>')
    expect(result).toContain('<p>')
    expect(result).toContain('<strong>')
    expect(result).toContain('<a href=')
  })

  it('parseFrontmatter handles large document', () => {
    const input = `---
title: Benchmark Test
slug: benchmark-test
---
${Array.from({ length: 500 }, (_, i) => `Line ${i + 1}: content`).join('\n')}`
    const result = parseFrontmatter(input)
    expect(result.data.title).toBe('Benchmark Test')
    expect(result.content).toContain('Line 500')
  })

  it('parseFrontmatter handles edge cases', () => {
    expect(parseFrontmatter('').data).toEqual({})
    expect(parseFrontmatter('no frontmatter').content).toBe('no frontmatter')
  })
})
