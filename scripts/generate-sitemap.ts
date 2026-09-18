import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

const ROOT = process.cwd()
const MANIFEST_DIR = path.join(ROOT, 'src', 'generated')
const CONTENT_DIR = path.join(ROOT, 'content', 'mdx')
const OUT_PATH = path.join(ROOT, 'public', 'sitemap.xml')

const ORIGIN = process.env.APP_ORIGIN || 'https://d7tun6.neome.uk'

interface SitemapUrl {
  loc: string
  lastmod?: string
  priority: number
  alternates?: { lang: string; href: string }[]
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function parseFrontmatter(source: string): Record<string, string> {
  const normalized = source.replace(/^\uFEFF/, '')
  if (!normalized.startsWith('---\n')) return {}
  const endIndex = normalized.indexOf('\n---\n', 4)
  if (endIndex === -1) return {}
  const raw = normalized.slice(4, endIndex)
  const data: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const i = line.indexOf(':')
    if (i === -1) continue
    const key = line.slice(0, i).trim()
    const value = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    if (key) data[key] = value
  }
  return data
}

function urlEntry(u: SitemapUrl): string {
  const lines = [`  <url>\n    <loc>${escapeXml(u.loc)}</loc>`]
  for (const alt of u.alternates ?? []) {
    lines.push(`    <xhtml:link rel="alternate" hreflang="${alt.lang}" href="${escapeXml(alt.href)}" />`)
  }
  if (u.lastmod) lines.push(`    <lastmod>${u.lastmod}</lastmod>`)
  lines.push(`    <priority>${u.priority}</priority>`)
  lines.push('  </url>')
  return lines.join('\n')
}

function alternateLangs(path: string, lang: string): { lang: string; href: string }[] {
  const otherLang = lang === 'en' ? 'ru' : 'en'
  return [{ lang: otherLang, href: `${ORIGIN}/${otherLang}${path}` }]
}

async function readNewsSlugs(): Promise<{ slug: string; publishedAt: string }[]> {
  const posts: { slug: string; publishedAt: string }[] = []
  for (const lang of ['en', 'ru']) {
    const dir = path.join(CONTENT_DIR, lang, 'news')
    const files = await readdir(dir).catch(() => [])
    for (const file of files) {
      if (!file.endsWith('.mdx')) continue
      const src = await readFile(path.join(dir, file), 'utf-8')
      const fm = parseFrontmatter(src)
      if (fm.slug && fm.publishedAt) {
        posts.push({ slug: fm.slug, publishedAt: fm.publishedAt })
      }
    }
  }
  return posts
}

async function main() {
  const urls: SitemapUrl[] = []

  // ── static pages ──
  const staticPages: { path: string; priority: number }[] = [
    { path: '', priority: 1.0 },
    { path: '/bio', priority: 0.9 },
    { path: '/music', priority: 0.9 },
    { path: '/news', priority: 0.8 },
    { path: '/blog', priority: 0.8 },
    { path: '/shop', priority: 0.8 },
    { path: '/links', priority: 0.6 },
    { path: '/legal', priority: 0.4 },
    { path: '/contact', priority: 0.5 },
    { path: '/gallery', priority: 0.7 },
    { path: '/radio', priority: 0.7 },
    { path: '/donate', priority: 0.6 },
    { path: '/projects', priority: 0.6 },
    { path: '/video', priority: 0.7 },
    { path: '/special', priority: 0.6 },
  ]

  for (const { path: pagePath, priority } of staticPages) {
    for (const lang of ['en', 'ru']) {
      urls.push({
        loc: `${ORIGIN}/${lang}${pagePath}`,
        priority,
        alternates: alternateLangs(pagePath, lang),
      })
    }
  }

  // ── music releases ──
  try {
    const manifest = JSON.parse(await readFile(path.join(MANIFEST_DIR, 'release-manifest.json'), 'utf-8'))
    for (const release of manifest.releases ?? []) {
      for (const lang of ['en', 'ru']) {
        const lastmod = release.releaseDate?.split('/').reverse().join('-') || undefined
        urls.push({
          loc: `${ORIGIN}/${lang}/music/${release.slug}`,
          lastmod,
          priority: 0.8,
          alternates: alternateLangs(`/music/${release.slug}`, lang),
        })
      }
    }
  } catch (e) {
    console.error('Failed to read release manifest:', e)
  }

  // ── shop products ──
  try {
    const manifest = JSON.parse(await readFile(path.join(MANIFEST_DIR, 'shop-manifest.json'), 'utf-8'))
    for (const product of manifest.products ?? []) {
      for (const lang of ['en', 'ru']) {
        urls.push({
          loc: `${ORIGIN}/${lang}/shop/${product.slug}`,
          priority: 0.7,
          alternates: alternateLangs(`/shop/${product.slug}`, lang),
        })
      }
    }
  } catch (e) {
    console.error('Failed to read shop manifest:', e)
  }

  // ── news posts ──
  try {
    const seen = new Set<string>()
    const posts = await readNewsSlugs()
    for (const post of posts) {
      if (seen.has(post.slug)) continue
      seen.add(post.slug)
      for (const lang of ['en', 'ru']) {
        urls.push({
          loc: `${ORIGIN}/${lang}/news/${post.slug}`,
          priority: 0.6,
          alternates: alternateLangs(`/news/${post.slug}`, lang),
        })
      }
    }
  } catch (e) {
    console.error('Failed to read news posts:', e)
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <!-- ── static pages ── -->
${urls.filter(u => !u.loc.includes('/music/') && !u.loc.includes('/shop/') && !u.loc.includes('/news/')).map(urlEntry).join('\n')}

  <!-- ── music releases ── -->
${urls.filter(u => u.loc.includes('/music/')).map(urlEntry).join('\n')}

  <!-- ── shop products ── -->
${urls.filter(u => u.loc.includes('/shop/')).map(urlEntry).join('\n')}

  <!-- ── news posts ── -->
${urls.filter(u => u.loc.includes('/news/')).map(urlEntry).join('\n')}
</urlset>
`

  await mkdir(path.dirname(OUT_PATH), { recursive: true })
  await writeFile(OUT_PATH, xml, 'utf-8')
  console.log(`Generated sitemap with ${urls.length} URLs (origin: ${ORIGIN})`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
