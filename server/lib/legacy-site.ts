import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { parseFrontmatter } from './frontmatter.js'
import { readArticle, readArticlesLang, readPages } from './mdx-utils.js'
import {
  buildLegacyReleasePage,
  buildNav,
  CORE_STYLES,
  escapeHtml,
  renderLegacyMarkdown,
  type LegacyNavFeatures,
  type LegacyReleaseTrack,
} from './legacy-shell.js'
export type { LegacyNavFeatures } from './legacy-shell.js'

const ROOT = process.cwd()
const GALLERY_DIR = path.join(ROOT, 'public', 'media', 'gallery')
const VIDEO_DIR = path.join(ROOT, 'public', 'media', 'video')
const RADIO_MDX = path.join(ROOT, 'public', 'media', 'radio', 'index.mdx')

export interface LegacyProduct {
  slug: string
  title: string
  category?: string
  priceValue?: number
  currency?: string
  status?: string
  quantity?: number
  coverUrl?: string
  images?: string[]
  descriptionMarkdown?: string
}
interface LegacyRelease {
  slug: string
  albumName: string
  artist?: string
  releaseType?: string
  releaseDate?: string
  notes?: string
  coverUrl?: string
  playlistM3uUrl?: string
  tracks?: LegacyReleaseTrack[]
  hidden?: boolean
}
interface LegacyArticle {
  slug: string
  title: string
  excerpt?: string
  publishedAt?: string
  content?: string
}
interface LegacyGalleryEntry {
  slug: string
  title: string
  date?: string
  tags?: string[]
  images: string[]
  cover?: string
}
interface LegacyVideoEntry {
  slug: string
  title: string
  date?: string
  description?: string
  thumbnail?: string
  sources: Array<{ url: string; type?: string }>
}

const L: Record<'en' | 'ru', Record<string, string>> = {
  en: {
    home: 'Home',
    music: 'Music',
    shop: 'Shop',
    news: 'News',
    blog: 'Blog',
    gallery: 'Gallery',
    video: 'Video',
    radio: 'Radio',
    bio: 'Bio',
    contact: 'Contact',
    donate: 'Donate',
    links: 'Links',
    legal: 'Legal',
    projects: 'Projects',
    releases: 'Releases',
    latestReleases: 'Latest releases',
    latestNews: 'Latest news',
    tracks: 'Tracks',
    products: 'Products',
    noProducts: 'Nothing here yet.',
    noReleases: 'Nothing here yet.',
    noNews: 'Nothing here yet.',
    noBlog: 'Nothing here yet.',
    noGallery: 'Nothing here yet.',
    noVideo: 'Nothing here yet.',
    back: 'Back',
    backToMusic: 'Back to music',
    backToShop: 'Back to shop',
    backToNews: 'Back to news',
    backToBlog: 'Back to blog',
    backToGallery: 'Back to gallery',
    backToVideo: 'Back to video',
    price: 'price',
    availability: 'availability',
    inStock: 'in stock',
    soldOut: 'sold out',
    quantity: 'quantity',
    images: 'images',
    tags: 'tags',
    stream: 'radio stream (Ogg / Vorbis)',
    tracklist: 'tracklist',
    watch: 'watch',
    sources: 'sources',
    projectsBlurb: 'Selected open-source work lives in the "links" section — mostly NixOS, Rust and dotfiles.',
  },
  ru: {
    home: 'Главная',
    music: 'Музыка',
    shop: 'Магазин',
    news: 'Новости',
    blog: 'Блог',
    gallery: 'Галерея',
    video: 'Видео',
    radio: 'Радио',
    bio: 'Био',
    contact: 'Контакты',
    donate: 'Донат',
    links: 'Ссылки',
    legal: 'Правовая информация',
    projects: 'Проекты',
    releases: 'Релизы',
    latestReleases: 'Последние релизы',
    latestNews: 'Последние новости',
    tracks: 'Треки',
    products: 'Товары',
    noProducts: 'Пока ничего нет.',
    noReleases: 'Пока ничего нет.',
    noNews: 'Пока ничего нет.',
    noBlog: 'Пока ничего нет.',
    noGallery: 'Пока ничего нет.',
    noVideo: 'Пока ничего нет.',
    back: 'Назад',
    backToMusic: 'К музыке',
    backToShop: 'В магазин',
    backToNews: 'К новостям',
    backToBlog: 'К блогу',
    backToGallery: 'В галерею',
    backToVideo: 'К видео',
    price: 'цена',
    availability: 'статус',
    inStock: 'в наличии',
    soldOut: 'продано',
    quantity: 'количество',
    images: 'изображения',
    tags: 'теги',
    stream: 'радио-поток (Ogg / Vorbis)',
    tracklist: 'треклист',
    watch: 'смотреть',
    sources: 'источники',
    projectsBlurb: 'Избранные открытые проекты — в разделе «ссылки»: в основном NixOS, Rust и dotfiles.',
  },
}

function parseReleaseDate(releaseDate?: string): number {
  if (!releaseDate) return 0
  const ddmmyyyy = releaseDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (ddmmyyyy) return Date.UTC(Number(ddmmyyyy[3]), Number(ddmmyyyy[2]) - 1, Number(ddmmyyyy[1]))
  const ddmmyy = releaseDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/)
  if (ddmmyy) return Date.UTC(2000 + Number(ddmmyy[3]), Number(ddmmyy[2]) - 1, Number(ddmmyy[1]))
  const isodate = releaseDate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (isodate) return Date.UTC(Number(isodate[1]), Number(isodate[2]) - 1, Number(isodate[3]))
  return 0
}

function compareReleasesByDateDesc(a: { releaseDate?: string; albumName: string }, b: { releaseDate?: string; albumName: string }): number {
  const delta = parseReleaseDate(b.releaseDate) - parseReleaseDate(a.releaseDate)
  if (delta !== 0) return delta
  return a.albumName.localeCompare(b.albumName, undefined, { sensitivity: 'base', numeric: true })
}

export async function getLegacyReleases(): Promise<LegacyRelease[]> {
  try {
    const raw = await readFile(path.join(ROOT, 'src', 'generated', 'release-manifest.json'), 'utf-8')
    const manifest = JSON.parse(raw) as { releases?: LegacyRelease[] }
    return (manifest.releases ?? []).filter((r) => !r.hidden).sort(compareReleasesByDateDesc)
  } catch {
    return []
  }
}

async function getLegacyProducts(): Promise<LegacyProduct[]> {
  try {
    const raw = await readFile(path.join(ROOT, 'src', 'generated', 'shop-manifest.json'), 'utf-8')
    const manifest = JSON.parse(raw) as {
      products?: Array<{
        slug: string
        title: string
        category?: string
        price?: { currency?: string; value?: number }
        unitAmount?: number
        status?: string
        quantity?: number
        coverUrl?: string
        images?: string[]
        descriptionMarkdown?: string
      }>
    }
    return (manifest.products ?? []).map((p) => ({
      slug: p.slug,
      title: p.title,
      category: p.category,
      priceValue: p.price?.value ?? (p.unitAmount != null ? p.unitAmount / 100 : undefined),
      currency: p.price?.currency ?? 'RUB',
      status: p.status,
      quantity: p.quantity,
      coverUrl: p.coverUrl,
      images: p.images,
      descriptionMarkdown: p.descriptionMarkdown,
    }))
  } catch {
    return []
  }
}

async function loadStaticBody(contentRoot: string, lang: 'en' | 'ru', key: string): Promise<string> {
  const pages = await readPages(contentRoot)
  const body = pages[lang][key]
  if (body) return body
  return pages[lang === 'ru' ? 'en' : 'ru'][key] ?? ''
}

async function loadArticles(contentRoot: string, lang: 'en' | 'ru', type: 'news' | 'blog'): Promise<LegacyArticle[]> {
  let list: LegacyArticle[] = []
  list = (await readArticlesLang(contentRoot, lang, type, false)).sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))
  if (list.length === 0) {
    const other: 'en' | 'ru' = lang === 'ru' ? 'en' : 'ru'
    list = (await readArticlesLang(contentRoot, other, type, false)).sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))
  }
  return list.map((p) => ({ slug: p.slug, title: p.title, excerpt: p.excerpt, publishedAt: p.publishedAt }))
}

async function loadArticle(contentRoot: string, lang: 'en' | 'ru', type: 'news' | 'blog', slug: string): Promise<LegacyArticle | null> {
  const other: 'en' | 'ru' = lang === 'ru' ? 'en' : 'ru'
  const post = await readArticle(contentRoot, lang, type, slug)
  if (post) return post
  return readArticle(contentRoot, other, type, slug)
}

async function loadGalleryEntries(): Promise<LegacyGalleryEntry[]> {
  const dirs = await readdir(GALLERY_DIR, { withFileTypes: true }).catch(() => [])
  const entries: LegacyGalleryEntry[] = []
  for (const d of dirs) {
    if (!d.isDirectory()) continue
    const slug = d.name
    try {
      const raw = await readFile(path.join(GALLERY_DIR, slug, 'index.mdx'), 'utf-8')
      const attrs = parseFrontmatter(raw)
      const images = Array.isArray(attrs.images) ? (attrs.images as string[]) : []
      const cover = attrs.cover
        ? (String(attrs.cover).startsWith('/') ? String(attrs.cover) : `/media/gallery/${slug}/${String(attrs.cover)}`)
        : ''
      entries.push({
        slug,
        title: String(attrs.title ?? slug),
        date: String(attrs.date ?? ''),
        tags: Array.isArray(attrs.tags) ? (attrs.tags as string[]) : [],
        images,
        cover,
      })
    } catch { /* skip unparseable entry */ }
  }
  entries.sort((a, b) => String(b.date).localeCompare(String(a.date)))
  return entries
}

async function loadVideoEntries(): Promise<LegacyVideoEntry[]> {
  const dirs = await readdir(VIDEO_DIR, { withFileTypes: true }).catch(() => [])
  const entries: LegacyVideoEntry[] = []
  for (const d of dirs) {
    if (!d.isDirectory()) continue
    const slug = d.name
    try {
      const raw = await readFile(path.join(VIDEO_DIR, slug, 'index.mdx'), 'utf-8')
      const attrs = parseFrontmatter(raw)
      const sourcesMatch = raw.match(/^sources:\n((?:[ \t].*(?:\n|$))*)/m)
      const sources: Array<{ url: string; type?: string }> = []
      if (sourcesMatch) {
        for (const line of sourcesMatch[1].split('\n')) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('- ')) continue
          const rest = trimmed.slice(2)
          const parts = rest.split(',')
          const entry: Record<string, string> = {}
          for (const part of parts) {
            const i = part.indexOf(':')
            if (i !== -1) entry[part.slice(0, i).trim()] = part.slice(i + 1).trim()
          }
          if (entry.url) sources.push({ url: entry.url, type: entry.type })
        }
      }
      const contentBody = raw.replace(/^---[\s\S]*?---\n?/, '').trim()
      entries.push({
        slug,
        title: String(attrs.title ?? slug),
        date: String(attrs.date ?? ''),
        description: attrs.description ? String(attrs.description) : contentBody,
        thumbnail: attrs.thumbnail
          ? (String(attrs.thumbnail).startsWith('/') ? String(attrs.thumbnail) : `/media/video/${slug}/videos/${String(attrs.thumbnail)}`)
          : '',
        sources,
      })
    } catch { /* skip unparseable entry */ }
  }
  entries.sort((a, b) => String(b.date).localeCompare(String(a.date)))
  return entries
}

async function loadRadioInfo(): Promise<{ trackCount: number; tracks: string[]; sample: string[] }> {
  try {
    const raw = await readFile(RADIO_MDX, 'utf-8')
    const m = raw.match(/^tracks:\n((?:[ \t].*(?:\n|$))*)/m)
    const tracks = m
      ? m[1]
          .split('\n')
          .map((l) => l.replace(/^[ \t]*-\s*/, '').trim())
          .filter(Boolean)
      : []
    return { trackCount: tracks.length, tracks, sample: tracks.slice(0, 30) }
  } catch {
    return { trackCount: 0, tracks: [], sample: [] }
  }
}

export function parseLegacyRoute(pathname: string): { section: string; slug?: string } {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] === 'ru' || parts[0] === 'en') parts.shift()
  if (parts.length === 0) return { section: 'main' }
  return { section: parts[0], slug: parts[1] }
}

function renderNav(nav: Array<[string, string]>, current: string): string {
  return nav
    .map(([href, label]) => {
      const isCurrent = href === '/' ? current === '/' : current === href || current.startsWith(href + '/')
      const link = `<a href="${href}">${escapeHtml(label)}</a>`
      return isCurrent ? `<strong>${link}</strong>` : link
    })
    .join(' ')
}

export interface LegacySiteDoc {
  level: 'level-1' | 'level-2'
  lang: 'en' | 'ru'
  siteName: string
  title: string
  h1: string
  nav: Array<[string, string]>
  currentHref: string
  children: string
  backHref?: string
  backLabel?: string
}

export function legacyDocument(o: LegacySiteDoc): { html: string; contentType: string } {
  const navHtml = renderNav(o.nav, o.currentHref)
  const back = o.backHref && o.backLabel ? `<p class="back"><a href="${escapeHtml(o.backHref)}">&laquo; ${escapeHtml(o.backLabel)}</a></p>` : ''
  const html = `<!doctype html>
<html lang="${o.lang}" class="${o.level}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta name="description" content="${escapeHtml(o.siteName)} — text mode"/>
<title>${escapeHtml(o.title)} — ${escapeHtml(o.siteName)}</title>
<link rel="stylesheet" href="/core.css"/>
<style>
${CORE_STYLES}
</style>
</head>
<body>
<main class="main">
<h1>${escapeHtml(o.h1)}</h1>
<p class="nav">${navHtml}</p>
${o.children}
${back}
</main>
</body>
</html>
`
  return { html, contentType: 'text/html; charset=utf-8' }
}

function rowList(items: Array<{ href: string; label: string; meta?: string }>): string {
  if (items.length === 0) return ''
  return `<ul class="releases">
${items.map((it) => `  <li><a href="${escapeHtml(it.href)}">${escapeHtml(it.label)}</a>${it.meta ? ` <span class="date">${escapeHtml(it.meta)}</span>` : ''}</li>`).join('\n')}
</ul>`
}

export interface LegacySitePageOptions {
  level: 'level-1' | 'level-2'
  pathname: string
  lang: 'en' | 'ru'
  siteName: string
  features: LegacyNavFeatures
  contentRoot: string
}

export async function buildLegacySitePage(options: LegacySitePageOptions): Promise<{ html: string; contentType: string }> {
  const { level, pathname, lang, siteName, features, contentRoot } = options
  const t = L[lang]
  const nav = buildNav(lang, features)
  const { section, slug } = parseLegacyRoute(pathname)

  const doc = (o: Omit<LegacySiteDoc, 'level' | 'lang' | 'siteName' | 'nav'>) =>
    legacyDocument({ level, lang, siteName, nav, ...o })

  // ── music ──
  if (section === 'music') {
    const releases = await getLegacyReleases()
    if (slug) {
      const release = releases.find((r) => r.slug === slug)
      if (release) {
        return buildLegacyReleasePage({
          level,
          siteName,
          lang,
          features,
          musicBackUrl: lang === 'ru' ? '/ru/music' : '/music',
          release,
        })
      }
      return doc({
        title: t.music,
        h1: t.music,
        currentHref: '/music',
        children: ``,
        backHref: '/music',
        backLabel: t.backToMusic,
      })
    }
    const rows = releases.map((r) => ({
      href: `/music/${r.slug}`,
      label: r.albumName,
      meta: [r.releaseDate?.slice(0, 10), r.releaseType && r.releaseType !== 'album' ? r.releaseType : ''].filter(Boolean).join(' · '),
    }))
    return doc({
      title: t.music,
      h1: t.music,
      currentHref: '/music',
      children: `<h2>${escapeHtml(t.releases)}</h2>\n${rowList(rows) || `<p>${escapeHtml(t.noReleases)}</p>`}`,
    })
  }

  // ── shop ──
  if (section === 'shop') {
    const products = await getLegacyProducts()
    if (slug) {
      const product = products.find((p) => p.slug === slug)
      if (product) {
        const desc = product.descriptionMarkdown ? renderLegacyMarkdown(product.descriptionMarkdown) : ''
        const meta = [
          product.category ? escapeHtml(product.category) : '',
          product.priceValue != null ? `${escapeHtml(String(product.priceValue))} ${escapeHtml(product.currency ?? '')}`.trim() : '',
          product.status === 'available' ? escapeHtml(t.inStock) : product.status === 'sold_out' || product.status === 'unavailable' ? escapeHtml(t.soldOut) : product.status ? escapeHtml(product.status) : '',
          product.quantity != null ? `${escapeHtml(t.quantity)}: ${product.quantity}` : '',
        ].filter(Boolean)
        const cover = product.coverUrl ? `<p class="cover"><img src="${escapeHtml(product.coverUrl)}" alt="${escapeHtml(product.title)}"/></p>` : ''
        const images = (product.images ?? [])
          .map((src) => `<a href="${escapeHtml(src)}"><img class="cover" style="max-width:120px" src="${escapeHtml(src)}" alt=""/></a>`)
          .join(' ')
        return doc({
          title: product.title,
          h1: product.title,
          currentHref: '/shop',
          backHref: '/shop',
          backLabel: t.backToShop,
          children: `${meta.length ? `<p class="meta">${meta.join(' · ')}</p>` : ''}${cover}${desc}${images ? `<p class="meta">${escapeHtml(t.images)}:</p><p>${images}</p>` : ''}`,
        })
      }
      return doc({
        title: t.shop,
        h1: t.shop,
        currentHref: '/shop',
        children: ``,
        backHref: '/shop',
        backLabel: t.backToShop,
      })
    }
    const rows = products.map((p) => ({
      href: `/shop/${p.slug}`,
      label: p.title,
      meta: [p.priceValue != null ? `${p.priceValue} ${p.currency ?? ''}`.trim() : '', p.status === 'available' ? t.inStock : p.status === 'sold_out' || p.status === 'unavailable' ? t.soldOut : p.status ?? ''].filter(Boolean).join(' · '),
    }))
    return doc({
      title: t.shop,
      h1: t.shop,
      currentHref: '/shop',
      children: `<h2>${escapeHtml(t.products)}</h2>\n${rowList(rows) || `<p>${escapeHtml(t.noProducts)}</p>`}`,
    })
  }

  // ── news / blog ──
  if (section === 'news' || section === 'blog') {
    const type = section === 'news' ? 'news' : ('blog' as 'news' | 'blog')
    if (slug) {
      const post = await loadArticle(contentRoot, lang, type, slug)
      if (!post) {
        return doc({
          title: t[section],
          h1: t[section],
          currentHref: `/${section}`,
          children: `<p>404 — ?</p>`,
          backHref: `/${section}`,
          backLabel: t[section === 'news' ? 'backToNews' : 'backToBlog'],
        })
      }
      const date = post.publishedAt ? `<p class="meta">${escapeHtml(post.publishedAt.slice(0, 10))}</p>` : ''
      const body = post.content ? renderLegacyMarkdown(post.content) : ''
      return doc({
        title: post.title,
        h1: post.title,
        currentHref: `/${section}`,
        backHref: `/${section}`,
        backLabel: t[section === 'news' ? 'backToNews' : 'backToBlog'],
        children: `${date}${body}`,
      })
    }
    const posts = await loadArticles(contentRoot, lang, type)
    const empty = posts.length === 0
    return doc({
      title: t[section],
      h1: t[section],
      currentHref: `/${section}`,
      children: empty
        ? `<p>${escapeHtml(t[section === 'news' ? 'noNews' : 'noBlog'])}</p>`
        : `<ul class="releases">
${posts.map((p) => `<li><a href="/${section}/${encodeURIComponent(p.slug)}">${escapeHtml(p.title)}</a>${p.publishedAt ? ` <span class="date">(${escapeHtml(p.publishedAt.slice(0, 10))})</span>` : ''}${p.excerpt && p.excerpt.trim() ? `<div class="date">${escapeHtml(p.excerpt.trim())}</div>` : ''}</li>`).join('\n')}
</ul>`,
    })
  }

  // ── gallery ──
  if (section === 'gallery') {
    const entries = await loadGalleryEntries()
    if (slug) {
      const entry = entries.find((e) => e.slug === slug)
      if (entry) {
        const titleRow = entry.title
        const meta = [
          entry.date ? escapeHtml(entry.date.slice(0, 10)) : '',
          entry.tags && entry.tags.length ? `${t.tags}: ${escapeHtml(entry.tags.join(', '))}` : '',
        ].filter(Boolean)
        const imgs = entry.images
          .map((name) => {
            const src = `/media/gallery/${slug}/${name}`
            return `<a href="${escapeHtml(src)}"><img class="cover" style="max-width:200px" src="${escapeHtml(src)}" alt=""/></a>`
          })
          .join(' ')
        return doc({
          title: titleRow,
          h1: titleRow,
          currentHref: '/gallery',
          backHref: '/gallery',
          backLabel: t.backToGallery,
          children: `${meta.length ? `<p class="meta">${meta.join(' · ')}</p>` : ''}<p>${imgs}</p>`,
        })
      }
      return doc({
        title: t.gallery,
        h1: t.gallery,
        currentHref: '/gallery',
        children: ``,
        backHref: '/gallery',
        backLabel: t.backToGallery,
      })
    }
    const rows = entries.map((e) => ({ href: `/gallery/${e.slug}`, label: e.title, meta: e.date ? e.date.slice(0, 10) : '' }))
    return doc({
      title: t.gallery,
      h1: t.gallery,
      currentHref: '/gallery',
      children: rowList(rows) || `<p>${escapeHtml(t.noGallery)}</p>`,
    })
  }

  // ── video ──
  if (section === 'video') {
    const entries = await loadVideoEntries()
    if (slug) {
      const entry = entries.find((e) => e.slug === slug)
      if (entry) {
        const meta = entry.date ? `<p class="meta">${escapeHtml(entry.date.slice(0, 10))}</p>` : ''
        const thumb = entry.thumbnail ? `<p class="cover"><img src="${escapeHtml(entry.thumbnail)}" alt="${escapeHtml(entry.title)}"/></p>` : ''
        const body = entry.description ? renderLegacyMarkdown(entry.description) : ''
        const srcs = entry.sources.length
          ? `<p class="meta">${escapeHtml(t.sources)}:</p><ul class="releases">${entry.sources.map((s) => `<li><a href="${escapeHtml(s.url)}">${escapeHtml(t.watch)} — ${escapeHtml(s.type ?? '')}</a></li>`).join('\n')}</ul>`
          : ''
        return doc({
          title: entry.title,
          h1: entry.title,
          currentHref: '/video',
          backHref: '/video',
          backLabel: t.backToVideo,
          children: `${meta}${thumb}${body}${srcs}`,
        })
      }
      return doc({
        title: t.video,
        h1: t.video,
        currentHref: '/video',
        children: ``,
        backHref: '/video',
        backLabel: t.backToVideo,
      })
    }
    const rows = entries.length
      ? `<ul class="releases">
${entries.map((e) => `  <li><a href="/video/${e.slug}">${escapeHtml(e.title)}</a>${e.date ? ` <span class="date">(${escapeHtml(e.date.slice(0, 10))})</span>` : ''}${e.thumbnail ? ` <br/><img class="cover" style="max-width:200px" src="${escapeHtml(e.thumbnail)}" alt=""/><br/>` : ''}</li>`).join('\n')}
</ul>`
      : ''
    return doc({
      title: t.video,
      h1: t.video,
      currentHref: '/video',
      children: rows || `<p>${escapeHtml(t.noVideo)}</p>`,
    })
  }

  // ── radio ──
  if (section === 'radio') {
    const info = await loadRadioInfo()
    const streamLink = `<p><a href="/api/radio/stream">${escapeHtml(t.stream)}</a></p>`
    const tracklist = `<h2>${escapeHtml(t.tracklist)} (${info.trackCount})</h2>
<ul class="releases">
${info.sample.map((tr) => `  <li>${escapeHtml(tr)}</li>`).join('\n')}
</ul>`
    return doc({
      title: t.radio,
      h1: t.radio,
      currentHref: '/radio',
      children: `${streamLink}${tracklist}`,
    })
  }

  // ── static MDX pages (main / bio / contact / donate / links / legal) ──
  if (section === 'main' || section === 'bio' || section === 'contact' || section === 'donate' || section === 'links' || section === 'legal') {
    const body = await loadStaticBody(contentRoot, lang, section === 'main' ? 'main' : section)
    const titleKey = section === 'main' ? 'home' : section
    const title = t[titleKey] || section
    const currentHref = section === 'main' ? '/' : `/${section}`
    const isHome = section === 'main'
    let children = body ? renderLegacyMarkdown(body) : ''
    if (isHome) {
      const [releases, news] = await Promise.all([
        getLegacyReleases(),
        loadArticles(contentRoot, lang, 'news'),
      ])
      const releaseRows = releases.slice(0, 5).map((r) => ({
        href: `/music/${r.slug}`,
        label: r.albumName,
        meta: `${r.releaseDate?.slice(0, 10) ?? ''}${r.releaseType && r.releaseType !== 'album' ? ' · ' + r.releaseType : ''}`,
      }))
      const newsRows = news.slice(0, 3)
      children += `<h2>${escapeHtml(t.latestReleases)}</h2>\n${rowList(releaseRows) || `<p>${escapeHtml(t.noReleases)}</p>`}`
      if (newsRows.length) {
        children += `<h2>${escapeHtml(t.latestNews)}</h2>\n<ul class="releases">\n${newsRows.map((p) => `<li><a href="/news/${encodeURIComponent(p.slug)}">${escapeHtml(p.title)}</a>${p.publishedAt ? ` <span class="date">(${escapeHtml(p.publishedAt.slice(0, 10))})</span>` : ''}</li>`).join('\n')}\n</ul>`
      }
    }
    return doc({
      title,
      h1: isHome ? siteName : title,
      currentHref,
      children,
    })
  }

  // ── projects (no mdx source — light static blurb) ──
  if (section === 'projects') {
    return doc({
      title: t.projects,
      h1: t.projects,
      currentHref: '/projects',
      children: `<p>${escapeHtml(t.projectsBlurb)}</p>`,
    })
  }

  // ── eagerly-rendered list lanes above, with fallbacks for the rest ──
  const body = await loadStaticBody(contentRoot, lang, 'main')
  const releases = await getLegacyReleases()
  const releaseRows = releases.slice(0, 5).map((r) => ({
    href: `/music/${r.slug}`,
    label: r.albumName,
    meta: `${r.releaseDate?.slice(0, 10) ?? ''}${r.releaseType && r.releaseType !== 'album' ? ' · ' + r.releaseType : ''}`,
  }))
  return doc({
    title: t.home,
    h1: siteName,
    currentHref: '/',
    children: `${body ? renderLegacyMarkdown(body) : ''}<h2>${escapeHtml(t.latestReleases)}</h2>\n${rowList(releaseRows) || `<p>${escapeHtml(t.noReleases)}</p>`}`,
  })
}