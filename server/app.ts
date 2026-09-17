import { Elysia } from 'elysia'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { createRateLimiter } from './lib/rate-limit.js'
import { requireFeature } from './middleware/feature-toggle.js'
import { createWellKnownRouter } from './routes/well-known.js'
import { generateOpenApi } from './lib/openapi.js'
import { AUTH_MD_TEMPLATE } from './static/auth-md.js'
import { createReleaseRouter } from './routes/releases.js'
import { createDownloadRouter } from './routes/download.js'
import { createAuthRouter } from './routes/auth.js'
import { createCommentsRouter } from './routes/comments.js'
import { createAdminRouter } from './routes/admin/index.js'
import { createOrdersRouter } from './routes/orders.js'
import { createConfigRouter, buildPublicConfig } from './routes/config.js'
import { createShippingRouter } from './routes/shipping.js'
import { createYooKassaRouter } from './routes/payments-yookassa.js'
import { createGalleryRouter } from './routes/gallery.js'
import { createVideoRouter } from './routes/video.js'
import { createStorageRouter } from './routes/storage.js'
import { createRadioRouter } from './routes/radio.js'
import { createStreamRouter } from './routes/stream.js'
import { createEqRouter } from './routes/eq.js'
import { createSocialRouter } from './routes/social.js'
import { createContentRouter } from './routes/content.js'
import { createHomeRouter } from './routes/home.js'
import { createArtistRouter } from './routes/artists.js'
import { createSubmissionsRouter } from './routes/submissions.js'
import { createSupportRouter } from './routes/support.js'
import { createModerationRouter } from './routes/moderation.js'
import { PublicRequestError } from './lib/release-download-service.js'
import { htmlToMarkdown, estimateTokens } from './lib/markdown.js'
import { readArticles } from './lib/mdx-utils.js'
import { getRequestIp } from './http/util.js'
import { trackActiveNode } from './lib/active-nodes.js'
import { detectClientLevel } from './lib/client-detect.js'
import { buildLegacyPage, CORE_STYLES } from './lib/legacy-shell.js'
import { buildLegacySitePage, getLegacyReleases, type LegacyNavFeatures } from './lib/legacy-site.js'
import type { AppServices } from './init.js'

// ── SEO: lazy-loaded manifest data for <head> meta tags ──

interface ManifestTrack {
  index?: number
  title: string
  url?: string
  streamUrl?: string
  sourceUrl?: string
  previewUrl?: string
  duration?: number
  previewable?: boolean
  isMain?: boolean
}
interface ManifestRelease {
  slug: string
  albumName: string
  artist?: string
  releaseType?: string
  releaseDate?: string
  notes?: string
  coverUrl?: string
  playlistM3uUrl?: string
  tracks?: ManifestTrack[]
  hidden?: boolean
}
interface ManifestProduct { slug: string; title: string; descriptionMarkdown?: string }
interface NewsEntry { slug: string; title: string; excerpt: string }

function parseFrontmatter(source: string): Record<string, string> {
  const normalized = source.replace(/^\uFEFF/, '')
  if (!normalized.startsWith('---\n')) return {}
  const end = normalized.indexOf('\n---\n', 4)
  if (end === -1) return {}
  const data: Record<string, string> = {}
  for (const line of normalized.slice(4, end).split('\n')) {
    const i = line.indexOf(':')
    if (i === -1) continue
    const key = line.slice(0, i).trim()
    const val = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    if (key) data[key] = val
  }
  return data
}

let _releaseMap: Map<string, ManifestRelease> | null = null
let _productMap: Map<string, ManifestProduct> | null = null
let _newsMap: Map<string, NewsEntry> | null = null

async function getReleaseMap(): Promise<Map<string, ManifestRelease>> {
  if (_releaseMap) return _releaseMap
  try {
    const raw = await readFile(path.join(ROOT, 'src', 'generated', 'release-manifest.json'), 'utf-8')
    const manifest = JSON.parse(raw)
    _releaseMap = new Map((manifest.releases ?? []).map((r: ManifestRelease) => [r.slug, r]))
  } catch { _releaseMap = new Map() }
  return _releaseMap
}

async function getProductMap(): Promise<Map<string, ManifestProduct>> {
  if (_productMap) return _productMap
  try {
    const raw = await readFile(path.join(ROOT, 'src', 'generated', 'shop-manifest.json'), 'utf-8')
    const manifest = JSON.parse(raw)
    _productMap = new Map((manifest.products ?? []).map((p: ManifestProduct) => [p.slug, p]))
  } catch { _productMap = new Map() }
  return _productMap
}

async function getNewsMap(): Promise<Map<string, NewsEntry>> {
  if (_newsMap) return _newsMap
  _newsMap = new Map()
  for (const lang of ['en', 'ru']) {
    const dir = path.join(ROOT, 'content', 'mdx', lang, 'news')
    const files = await readdir(dir).catch(() => [])
    for (const file of files) {
      if (!file.endsWith('.mdx')) continue
      const src = await readFile(path.join(dir, file), 'utf-8')
      const fm = parseFrontmatter(src)
      if (fm.slug && !_newsMap.has(fm.slug)) {
        _newsMap.set(fm.slug, {
          slug: fm.slug,
          title: fm.title || fm.slug,
          excerpt: fm.excerpt || '',
        })
      }
    }
  }
  return _newsMap
}

const SITE_NAME = process.env.SITE_NAME || 'D7TUN6'

const STATIC_PAGE_TITLES: Record<string, { title: string; description: string }> = {
  '':      { title: SITE_NAME, description: 'Independent music, art, and experimental audio.' },
  bio:     { title: 'Bio', description: 'About D7TUN6 — independent music project.' },
  music:   { title: 'Music', description: 'Discography and releases by D7TUN6.' },
  news:    { title: 'News', description: 'Latest news and updates from D7TUN6.' },
  blog:    { title: 'Blog', description: 'Blog posts by D7TUN6.' },
  shop:    { title: 'Shop', description: 'Merchandise and physical releases.' },
  links:   { title: 'Links', description: 'Social links and streaming platforms.' },
  legal:   { title: 'Legal', description: 'Terms of service and legal information.' },
  contact: { title: 'Contact', description: 'Get in touch with D7TUN6.' },
  gallery: { title: 'Gallery', description: 'Photo gallery — D7TUN6 live and studio.' },
  radio:   { title: 'Radio', description: 'Listen to D7TUN6 radio stream.' },
  donate:  { title: 'Donate', description: 'Support D7TUN6.' },
  projects:{ title: 'Projects', description: 'Open source and side projects.' },
  video:   { title: 'Video', description: 'Music videos and live performances.' },
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

async function buildHeadTags(pathname: string, origin: string): Promise<string> {
  const parts = pathname.split('/').filter(Boolean)
  const lang = parts[0] === 'ru' ? 'ru' : 'en'
  const route = parts.length <= 1 ? '' : parts.slice(1).join('/')
  const pageUrl = `${origin}${pathname}`

  let title = SITE_NAME
  let description = 'Independent music, art, and experimental audio.'
  let ogImage: string | null = null

  if (!route || route === '') {
    const p = STATIC_PAGE_TITLES['']
    title = p.title
    description = p.description
  } else if (route === 'music') {
    title = `Music - ${SITE_NAME}`
    description = 'Discography and releases by D7TUN6.'
  } else if (route.startsWith('music/')) {
    const slug = route.split('/')[1]
    const releases = await getReleaseMap()
    const release = releases.get(slug)
    if (release) {
      title = `${release.albumName} - ${SITE_NAME}`
      description = `${release.albumName} by D7TUN6.`
      ogImage = `${origin}/media/music/${release.albumName}/cover/cover-preview.webp`
    }
  } else if (route === 'shop') {
    title = `Shop - ${SITE_NAME}`
    description = 'Merchandise and physical releases.'
  } else if (route.startsWith('shop/')) {
    const slug = route.split('/')[1]
    const products = await getProductMap()
    const product = products.get(slug)
    if (product) {
      title = `${product.title} - ${SITE_NAME}`
      description = product.descriptionMarkdown?.slice(0, 160) || product.title
    }
  } else if (route === 'news') {
    title = `News - ${SITE_NAME}`
    description = 'Latest news and updates from D7TUN6.'
  } else if (route.startsWith('news/')) {
    const slug = route.split('/')[1]
    const news = await getNewsMap()
    const post = news.get(slug)
    if (post) {
      title = `${post.title} - ${SITE_NAME}`
      description = post.excerpt || post.title
    }
  } else {
    const staticPage = STATIC_PAGE_TITLES[route]
    if (staticPage) {
      title = `${staticPage.title} - ${SITE_NAME}`
      description = staticPage.description
    }
  }

  const langAlt = lang === 'en' ? 'ru' : 'en'
  const altPath = parts.length <= 1 ? `/${langAlt}` : `/${langAlt}/${route}`

  const tags = [
    `    <title>${escapeHtml(title)}</title>`,
    `    <meta name="description" content="${escapeHtml(description)}" />`,
    `    <meta property="og:title" content="${escapeHtml(title)}" />`,
    `    <meta property="og:description" content="${escapeHtml(description)}" />`,
    `    <meta property="og:url" content="${escapeHtml(pageUrl)}" />`,
    `    <meta property="og:type" content="website" />`,
    `    <link rel="canonical" href="${escapeHtml(pageUrl)}" />`,
    `    <link rel="alternate" hreflang="${lang}" href="${escapeHtml(pageUrl)}" />`,
    `    <link rel="alternate" hreflang="${langAlt}" href="${escapeHtml(origin + altPath)}" />`,
    `    <link rel="alternate" hreflang="x-default" href="${escapeHtml(origin + '/' + lang + (route ? '/' + route : ''))}" />`,
  ]
  if (ogImage) {
    tags.push(`    <meta property="og:image" content="${escapeHtml(ogImage)}" />`)
  }
  return tags.join('\n')
}

const ROOT = process.cwd()
const DIST_DIR = path.join(ROOT, 'dist')
const APP_ORIGIN_URL = process.env.APP_ORIGIN || ''
const SITE_HOST = APP_ORIGIN_URL ? new URL(APP_ORIGIN_URL).hostname : 'localhost'

const FAR_FUTURE_CACHE = 'public, max-age=31536000, immutable'

const STATIC_MEDIA_EXT = new Set([
  'avif', 'gif', 'ico', 'jpeg', 'jpg', 'png', 'svg', 'webp',
  'woff', 'woff2',
])

type FeatureGate = [prefix: string, feature: string]
const FEATURE_GATES: FeatureGate[] = [
  ['/api/orders', 'orders'],
  ['/api/shipping', 'shop'],
  ['/api/payments/yookassa', 'shop'],
  ['/api/gallery', 'gallery'],
  ['/api/video', 'video'],
  ['/api/radio', 'radio'],
]

function securityHeaders(nonce: string): Record<string, string> {
  return {
    'content-security-policy': [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}'`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https: blob:",
      "media-src 'self' blob:",
      "connect-src 'self' https://api.yookassa.ru https://yookassa.ru",
      "frame-src 'self' https://yookassa.ru",
      "font-src 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
    ].join('; '),
    'cross-origin-opener-policy': 'same-origin',
    'origin-agent-cluster': '?1',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
    'x-content-type-options': 'nosniff',
    'x-dns-prefetch-control': 'off',
    'x-frame-options': 'SAMEORIGIN',
    'x-permitted-cross-domain-policies': 'none',
  }
}

async function resolveStaticFile(baseDirs: string[], pathname: string): Promise<string | null> {
  const decoded = decodeURIComponent(pathname)
  if (decoded.includes('\0')) return null
  for (const baseDir of baseDirs) {
    const absBase = path.resolve(baseDir)
    const target = path.resolve(absBase, '.' + decoded)
    if (!target.startsWith(absBase + path.sep)) continue
    const file = Bun.file(target)
    if (await file.exists()) return target
  }
  return null
}

export function createApp(services: AppServices) {
  const { db, releaseService, orderHub, manifestPath, publicDir, contentRoot } = services
  const generalRateLimiter = createRateLimiter(500, 60_000)

  return new Elysia({
    serve: {
      idleTimeout: 255,
      maximumSize: 2 * 1024 * 1024 * 1024,
    } as never,
  })
    .derive(() => {
      const nonce = crypto.randomBytes(16).toString('base64')
      return { nonce }
    })
    .onBeforeHandle(({ request, server, set, nonce }) => {
      Object.assign(set.headers, securityHeaders(nonce))
      // Count this client as an active node (sliding window keyed by ip+ua).
      const ua = request.headers.get('user-agent') || ''
      trackActiveNode(`${getRequestIp({ request, server })}::${ua}`)
      const pathname = new URL(request.url).pathname
      if (pathname.startsWith('/api/')) {
        if (!generalRateLimiter(getRequestIp({ request, server }))) {
          set.status = 429
          return { error: 'Too many requests' }
        }
        for (const [prefix, feature] of FEATURE_GATES) {
          if (pathname === prefix || pathname.startsWith(prefix + '/')) {
            const denied = requireFeature(feature)({ set })
            if (denied) return denied
          }
        }
      }
    })
    .onError(({ error, code, set }) => {
      if (error instanceof PublicRequestError) {
        set.status = error.status
        return { error: error.message }
      }
      if (code === 'PARSE' || code === 'VALIDATION') {
        set.status = 400
        return { error: 'Invalid request body' }
      }
      console.error('Elysia error:', error)
      set.status = 500
      return { error: 'Internal Server Error' }
    })

    // ── api routers ──
    .use(createModerationRouter({ db }))
    .use(createReleaseRouter({ db }))
    .use(createDownloadRouter(releaseService))
    .use(createAuthRouter({ db }))
    .use(createCommentsRouter({ db }))
    .use(createAdminRouter({ db, manifestPath, releaseService, contentRoot }))
    .use(createOrdersRouter({ db, hub: orderHub }))
    .use(createConfigRouter())
    .use(createShippingRouter())
    .use(createYooKassaRouter({ db, hub: orderHub }))
    .use(createGalleryRouter({ db }))
    .use(createVideoRouter({ db }))
    .use(createStorageRouter())
    .use(createRadioRouter({ manifestPath }))
    .use(createStreamRouter(manifestPath, publicDir))
    .use(createEqRouter(path.join(ROOT, 'tmp')))
    .use(createSocialRouter({ db }))
    .use(createContentRouter({ contentRoot }))
    .use(createHomeRouter())
    .use(createArtistRouter({ db }))
    .use(createSubmissionsRouter({ db }))
    .use(createSupportRouter({ db }))
    .use(createWellKnownRouter())

    // ── MPP payment discovery ──
    .get('/openapi.json', ({ set }) => {
      const base = APP_ORIGIN_URL.replace(/\/+$/, '')
      set.headers['content-type'] = 'application/json; charset=utf-8'
      set.headers['cache-control'] = 'max-age=300'
      set.headers['access-control-allow-origin'] = APP_ORIGIN_URL || '*'
      set.headers['access-control-allow-methods'] = 'GET'
      set.headers['access-control-allow-headers'] = 'Content-Type'
      return generateOpenApi(base)
    })

    // ── auth.md for agent registration ──
    .get('/auth.md', ({ set }) => {
      const base = APP_ORIGIN_URL.replace(/\/+$/, '')
      set.headers['content-type'] = 'text/markdown; charset=utf-8'
      set.headers.vary = 'Accept'
      return AUTH_MD_TEMPLATE(base)
    })

    // ── immutable content-addressed assets ──
    .get('/media/*', async ({ params, set }) => {
      const filePath = await resolveStaticFile([publicDir + '/media'], '/' + params['*'])
      if (!filePath) {
        set.status = 404
        set.headers['content-type'] = 'text/plain; charset=utf-8'
        return 'Not found'
      }
      // iOS Safari / WebKit requires explicit MIME for HLS
      if (filePath.endsWith('.m3u8')) {
        set.headers['content-type'] = 'application/vnd.apple.mpegurl'
        // playlists must not be immutable-cached
        set.headers['cache-control'] = 'no-cache, no-store, must-revalidate'
        set.headers['access-control-allow-origin'] = '*'
        return new Response(Bun.file(filePath))
      }
      if (filePath.endsWith('.ts')) {
        set.headers['content-type'] = 'video/mp2t'
        set.headers['cache-control'] = FAR_FUTURE_CACHE
        return new Response(Bun.file(filePath))
      }
      if (filePath.endsWith('.mp4')) {
        set.headers['content-type'] = 'video/mp4'
        set.headers['cache-control'] = FAR_FUTURE_CACHE
        return new Response(Bun.file(filePath))
      }
      set.headers['cache-control'] = FAR_FUTURE_CACHE
      set.headers['content-type'] = Bun.file(filePath).type
      return new Response(Bun.file(filePath))
    })
    .get('/assets/*', async ({ params, set }) => {
      const filePath = await resolveStaticFile([DIST_DIR + '/assets'], '/' + params['*'])
      if (!filePath) {
        set.status = 404
        set.headers['content-type'] = 'text/plain; charset=utf-8'
        return 'Not found'
      }
      set.headers['cache-control'] = FAR_FUTURE_CACHE
      set.headers['content-type'] = Bun.file(filePath).type
      return new Response(Bun.file(filePath))
    })

    // ── legacy /core.css — self-contained stylesheet for level-1/2 shells ──
    .get('/core.css', ({ set }) => {
      set.headers['content-type'] = 'text/css; charset=utf-8'
      set.headers['cache-control'] = 'public, max-age=3600'
      return CORE_STYLES
    })

    // ── RSS feed for the blog ──
    .get('/rss.xml', async ({ set }) => {
      try {
        const [en, ru] = await Promise.all([
          readArticles(ROOT + '/content/mdx', 'blog').then((r) => r.en),
          readArticles(ROOT + '/content/mdx', 'blog').then((r) => r.ru),
        ])
        const items = [...en.map((p) => ({ ...p, lang: 'en' as const })), ...ru.map((p) => ({ ...p, lang: 'ru' as const }))]
          .filter((p) => p.publishedAt)
          .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
          .slice(0, 40)
        const base = APP_ORIGIN_URL.replace(/\/+$/, '')
        const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
        const rfcDate = (iso: string) => {
          const d = new Date(iso)
          return Number.isNaN(d.getTime()) ? new Date().toUTCString() : d.toUTCString()
        }
        const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>${xmlEscape(SITE_NAME)} — blog</title>
  <link>${xmlEscape(base)}</link>
  <description>Notes, process logs, releases — everything between music and code.</description>
  ${items.map((p) => `<item>
    <title>${xmlEscape(p.title)}</title>
    <link>${xmlEscape(`${base}/${p.lang}/blog/${encodeURIComponent(p.slug)}`)}</link>
    <guid isPermaLink="false">${xmlEscape(p.slug)}-${p.lang}</guid>
    <pubDate>${rfcDate(p.publishedAt)}</pubDate>
    <description>${xmlEscape(p.excerpt || p.title)}</description>
  </item>`).join('\n')}
</channel></rss>`
        set.headers['content-type'] = 'application/rss+xml; charset=utf-8'
        set.headers['cache-control'] = 'public, max-age=600'
        set.status = 200
        return feed
      } catch (err) {
        console.error('rss failed', err)
        set.status = 500
        set.headers['content-type'] = 'text/plain; charset=utf-8'
        return 'Failed to build feed'
      }
    })

    // ── everything else: static files, then SPA shell ──
    .get('/*', async ({ request, set, nonce }) => {
      const url = new URL(request.url)
      const pathname = url.pathname
      const accept = request.headers.get('accept') || ''

      const ext = path.extname(pathname)
      const markdownEligible = /text\/markdown/.test(accept)
        && !pathname.startsWith('/api/')
        && !pathname.startsWith('/media/')
        && !pathname.startsWith('/assets/')
        && (!ext || ext === '.html' || ext === '.htm')

      let indexHtml: string | null = null
      if (markdownEligible) {
        indexHtml = await readFile(path.join(DIST_DIR, 'index.html'), 'utf-8').catch(() => null)
        if (indexHtml) {
          const markdown = htmlToMarkdown(indexHtml)
          set.headers['content-type'] = 'text/markdown; charset=utf-8'
          set.headers['x-markdown-tokens'] = String(estimateTokens(markdown))
          set.headers['x-original-tokens'] = String(estimateTokens(indexHtml))
          set.headers.vary = 'Accept'
          set.headers['cache-control'] = 'no-cache'
          return markdown
        }
      }

      if (pathname !== '/') {
        const staticPath = await resolveStaticFile([publicDir, DIST_DIR], pathname)
        if (staticPath) {
          set.headers['content-type'] = Bun.file(staticPath).type
          const staticExt = path.extname(staticPath).toLowerCase().replace('.', '')
          if (STATIC_MEDIA_EXT.has(staticExt)) {
            set.headers['cache-control'] = 'public, max-age=604800'
          }
          return new Response(Bun.file(staticPath))
        }

        if (pathname.startsWith('/assets/') || pathname.startsWith('/media/') || ext) {
          set.status = 404
          set.headers['content-type'] = 'text/plain; charset=utf-8'
          return 'Not found'
        }
      }

      // ── client capability levels: serve a JS-free shell for legacy devices ──
      // `?text=1` (or a `legacy=1` cookie) forces the text shell even for
      // modern browsers with JS disabled — noscript fallback users land here.
      const reqUrl = new URL(request.url)
      const wantsText =
        reqUrl.searchParams.get('text') === '1' || (request.headers.get('cookie') ?? '').includes('legacy=1')
      const level = wantsText ? 'level-1' : detectClientLevel(request)
      set.headers['x-client-level'] = level
      if (level !== 'level-3') {
        // level-0 (WAP/Opera Mini) keeps the oldest, tiniest home shell.
        if (level === 'level-0') {
          const releases = await getLegacyReleases()
          const lang = pathname.split('/').filter(Boolean)[0] === 'ru' ? 'ru' : 'en'
          const legacy = buildLegacyPage({
            level,
            pathname,
            origin: `https://${SITE_HOST}`,
            siteName: SITE_NAME,
            releases,
            lang,
          })
          set.headers['content-type'] = legacy.contentType
          set.headers.vary = 'User-Agent, Accept'
          set.headers['cache-control'] = 'no-cache'
          return legacy.html
        }

        // Full JS-free text shell for level-1/2 (Dillo, NetSurf, Lynx, ?text=1):
        // every navbar section is rendered server-side from parsed content.
        const lang = pathname.split('/').filter(Boolean)[0] === 'ru' ? 'ru' : 'en'
        const features = (buildPublicConfig().features ?? {}) as LegacyNavFeatures
        const legacyPage = await buildLegacySitePage({
          level,
          pathname,
          lang,
          siteName: SITE_NAME,
          features,
          contentRoot,
        })
        set.headers['content-type'] = legacyPage.contentType
        set.headers.vary = 'User-Agent, Accept'
        set.headers['cache-control'] = 'no-cache'
        return legacyPage.html
      }

      indexHtml = await readFile(path.join(DIST_DIR, 'index.html'), 'utf-8').catch(() => null)
      if (!indexHtml) {
        set.status = 503
        set.headers['retry-after'] = '5'
        set.headers['content-type'] = 'text/plain; charset=utf-8'
        return 'Site is rebuilding, please retry in a few seconds'
      }

      const origin = `https://${SITE_HOST}`
      const pageUrl = `${origin}${pathname}`
      const links = [
        '</api/content/manifest>; rel="api-catalog"',
        '</api/config>; rel="describedby"',
        `<https://${SITE_HOST}/api/content/manifest>; rel="api-catalog"`,
        `<${pageUrl}>; rel="canonical"`,
      ]
      if (/text\/markdown/.test(accept)) {
        links.push(`<${pageUrl}>; rel="alternate"; type="text/markdown"`)
      }
      set.headers.link = links.join(', ')
      set.headers.vary = 'User-Agent, Accept'
      set.headers['cache-control'] = 'no-cache'
      set.headers['content-type'] = 'text/html; charset=utf-8'
      const config = buildPublicConfig()
      const headTags = await buildHeadTags(pathname, origin)
      // Synchronous, nonce'd: apply the cached perf tier before first paint so
      // the .tier-N CSS gating kicks in without a flash. The full benchmark
      // only ever runs when this cache is empty (see src/lib/perf/tier-detector.ts).
      const tierBootstrap = `<script nonce="${nonce}">try{var t=localStorage.getItem("sys_perf_tier"),v=t===null?-1:parseInt(t,10);if(v>=0&&v<=4)document.documentElement.classList.add("tier-"+v)}catch(e){}</script>`
      return indexHtml
        .replace('<html', `<html class="${level}"`)
        .replace(
          '</head>',
          `${headTags}\n    <script nonce="${nonce}">window.__INITIAL_CONFIG__=${JSON.stringify(config)}</script>${tierBootstrap}</head>`
        )
    })

    // unknown /api subpaths never fall through to the SPA shell
    .all('/api/*', ({ set }) => {
      set.status = 404
      return { error: 'Not found' }
    })
}
