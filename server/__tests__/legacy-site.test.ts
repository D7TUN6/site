import { describe, it, expect } from 'bun:test'
import { parseLegacyRoute, legacyDocument, getLegacyReleases } from '../lib/legacy-site.js'
import { buildNav, renderLegacyMarkdown } from '../lib/legacy-shell.js'

describe('parseLegacyRoute', () => {
  it('parses top-level and language-prefixed routes', () => {
    expect(parseLegacyRoute('/')).toEqual({ section: 'main' })
    expect(parseLegacyRoute('/ru')).toEqual({ section: 'main' })
    expect(parseLegacyRoute('/en/music')).toEqual({ section: 'music' })
    expect(parseLegacyRoute('/music/a-path-of-static-snow')).toEqual({ section: 'music', slug: 'a-path-of-static-snow' })
    expect(parseLegacyRoute('/ru/blog/hello-world')).toEqual({ section: 'blog', slug: 'hello-world' })
  })
})

describe('buildNav', () => {
  it('keeps SPA order and hides disabled feature sections', () => {
    const nav = buildNav('en')
    expect(nav.map(([href]) => href)).toEqual([
      '/', '/bio', '/music', '/news', '/blog', '/links', '/donate', '/projects', '/gallery', '/video', '/radio', '/shop',
    ])
    const gated = buildNav('ru', { shop: false, radio: false, releases: false })
    expect(gated.map(([href]) => href).includes('/shop')).toBe(false)
    expect(gated.map(([href]) => href).includes('/radio')).toBe(false)
    expect(gated.map(([href]) => href).includes('/music')).toBe(false)
    expect(gated.map(([href]) => href)[1]).toBe('/bio')
  })
})

describe('legacyDocument', () => {
  it('wraps children with nav, title and optional back link', () => {
    const { html } = legacyDocument({
      level: 'level-1',
      lang: 'en',
      siteName: 'D7TUN6',
      title: 'News',
      h1: 'News',
      nav: buildNav('en'),
      currentHref: '/news',
      children: '<p>hello</p>',
      backHref: '/music',
      backLabel: 'Back',
    })
    expect(html).toContain('<h1>News</h1>')
    expect(html).toContain('<p>hello</p>')
    expect(html).toContain('&laquo; Back')
    expect(html).toContain('<strong><a href="/news">News</a></strong>')
  })
})

describe('renderLegacyMarkdown', () => {
  it('renders headings, lists, bold and links', () => {
    const html = renderLegacyMarkdown('# Title\n\n## bio\n- one\n- two\n\n1. first\n2. second\n\n[link](https://x.y) and **bold**')
    expect(html).toContain('<h3>Title</h3>')
    expect(html).toContain('<h3>bio</h3>')
    expect(html).toContain('<ul>\n<li>one</li>\n<li>two</li>\n</ul>')
    expect(html).toContain('<ol>\n<li>first</li>\n<li>second</li>\n</ol>')
    expect(html).toContain('<a href="https://x.y">link</a>')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).not.toContain('<script')
  })
})

describe('getLegacyReleases', () => {
  it('loads releases from the generated manifest', async () => {
    const releases = await getLegacyReleases()
    expect(Array.isArray(releases)).toBe(true)
    expect(releases.every((r) => r.slug && r.albumName)).toBe(true)
  })
})