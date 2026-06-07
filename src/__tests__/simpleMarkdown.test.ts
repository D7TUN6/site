import { describe, it, expect } from 'vitest'
import { renderSimpleMarkdown } from '@/lib/simpleMarkdown'

describe('renderSimpleMarkdown', () => {
  it('renders empty string', () => {
    expect(renderSimpleMarkdown('')).toBe('')
  })

  it('renders headings', () => {
    expect(renderSimpleMarkdown('# Title')).toBe('<h1>Title</h1>')
    expect(renderSimpleMarkdown('## Subtitle')).toBe('<h2>Subtitle</h2>')
    expect(renderSimpleMarkdown('### Subsubtitle')).toBe('<h3>Subsubtitle</h3>')
  })

  it('escapes HTML in headings', () => {
    expect(renderSimpleMarkdown('# <script>alert(1)</script>')).toBe('<h1>&lt;script&gt;alert(1)&lt;/script&gt;</h1>')
  })

  it('renders paragraphs', () => {
    expect(renderSimpleMarkdown('Hello world')).toBe('<p>Hello world</p>')
  })

  it('renders multiple paragraphs separated by blank lines', () => {
    expect(renderSimpleMarkdown('First paragraph\n\nSecond paragraph')).toBe('<p>First paragraph</p>\n<p>Second paragraph</p>')
  })

  it('renders unordered list', () => {
    const result = renderSimpleMarkdown('- Item one\n- Item two\n- Item three')
    expect(result).toBe('<ul>\n<li>Item one</li>\n<li>Item two</li>\n<li>Item three</li>\n</ul>')
  })

  it('closes list before heading', () => {
    const result = renderSimpleMarkdown('- Item\n## Heading')
    expect(result).toBe('<ul>\n<li>Item</li>\n</ul>\n<h2>Heading</h2>')
  })

  it('closes list before paragraph', () => {
    const result = renderSimpleMarkdown('- Item\nParagraph')
    expect(result).toBe('<ul>\n<li>Item</li>\n</ul>\n<p>Paragraph</p>')
  })

  it('renders inline bold', () => {
    expect(renderSimpleMarkdown('This is **bold** text')).toBe('<p>This is <strong>bold</strong> text</p>')
  })

  it('renders inline links', () => {
    expect(renderSimpleMarkdown('Click [here](https://example.com)')).toBe('<p>Click <a href="https://example.com">here</a></p>')
  })

  it('renders bold inside list items', () => {
    expect(renderSimpleMarkdown('- **Important** item')).toBe('<ul>\n<li><strong>Important</strong> item</li>\n</ul>')
  })

  it('renders mixed content', () => {
    const input = '# Welcome\n\nThis is **cool** [link](https://example.com)\n\n- Item one\n- Item two'
    const result = renderSimpleMarkdown(input)
    expect(result).toContain('<h1>')
    expect(result).toContain('<strong>')
    expect(result).toContain('<a href="https://example.com"')
    expect(result).toContain('<li>')
    expect(result).toContain('</ul>')
  })

  it('escapes HTML entities in paragraph text', () => {
    expect(renderSimpleMarkdown('Use &lt; for less than')).toBe('<p>Use &amp;lt; for less than</p>')
  })

  it('passes through HTML block tags', () => {
    expect(renderSimpleMarkdown('<b>not bold</b>')).toBe('<b>not bold</b>')
  })

  it('handles unclosed inline markers with graceful degradation', () => {
    expect(renderSimpleMarkdown('Unclosed **bold')).toBe('<p>Unclosed **bold</p>')
  })
})
