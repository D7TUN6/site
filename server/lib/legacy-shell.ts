import type { ClientLevel } from './client-detect.js'

export interface LegacyReleaseItem {
  slug: string
  albumName: string
  releaseDate?: string
}

export interface LegacyPageOptions {
  level: ClientLevel
  pathname: string
  origin: string
  siteName: string
  releases: LegacyReleaseItem[]
  lang: 'en' | 'ru'
}

export interface LegacyPageResult {
  html: string
  contentType: string
}

/**
 * Shared legacy stylesheet — also served at GET /core.css.
 * Deliberately CSS2/3-safe: no custom properties, no flex/grid reliance,
 * plain block layout and inline <a> nav. Mobile-first, low contrast greed.
 */
export const CORE_STYLES = `html, body { margin: 0; padding: 0; }
body {
  background-color: #07070c;
  color: #d4d4dc;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 15px;
  line-height: 1.5;
  padding: 12px;
}
h1 { font-size: 22px; margin: 0 0 8px; }
h2 { font-size: 17px; margin: 12px 0 6px; color: #cdc3ff; }
p { margin: 6px 0; }
a { color: #8f7cff; }
a:visited { color: #7a6ab8; }
.nav { margin: 8px 0 12px; }
.nav a { margin-right: 8px; }
ul.releases { list-style: none; margin: 8px 0; padding: 0; }
ul.releases li { margin: 4px 0; }
.date { color: #78788c; font-size: 13px; }
.note { margin-top: 18px; font-size: 12px; color: #8a8a9c; }
.main { display: block; }
.cover img { border: 1px solid #3a3a50; max-width: 160px; height: auto; }
.meta { color: #8a8a9c; }
ul.tracks { list-style: none; margin: 8px 0; padding: 0; }
ul.tracks li { border-bottom: 1px solid #26263a; padding: 8px 0; }
ul.tracks audio { display: block; margin: 4px 0 4px; width: 100%; }
.track-meta { color: #8a8a9c; font-size: 13px; }
.track-links { font-size: 13px; }
.back { margin-top: 16px; }
`

const NAV_ORDER = [
  '/',
  '/bio',
  '/music',
  '/news',
  '/blog',
  '/links',
  '/donate',
  '/projects',
  '/gallery',
  '/video',
  '/radio',
  '/shop',
]

const NAV_LABELS: Record<'en' | 'ru', Record<string, string>> = {
  en: {
    '/': 'Home',
    '/bio': 'Bio',
    '/music': 'Music',
    '/news': 'News',
    '/blog': 'Blog',
    '/links': 'Links',
    '/donate': 'Donate',
    '/projects': 'Projects',
    '/gallery': 'Gallery',
    '/video': 'Video',
    '/radio': 'Radio',
    '/shop': 'Shop',
  },
  ru: {
    '/': 'Главная',
    '/bio': 'Био',
    '/music': 'Музыка',
    '/news': 'Новости',
    '/blog': 'Блог',
    '/links': 'Ссылки',
    '/donate': 'Донат',
    '/projects': 'Проекты',
    '/gallery': 'Галерея',
    '/video': 'Видео',
    '/radio': 'Радио',
    '/shop': 'Магазин',
  },
}

const NAV_FEATURE_KEY: Record<string, keyof LegacyNavFeatures | undefined> = {
  '/music': 'releases',
  '/news': 'news',
  '/blog': 'blog',
  '/projects': 'projects',
  '/gallery': 'gallery',
  '/video': 'video',
  '/radio': 'radio',
  '/shop': 'shop',
}

export interface LegacyNavFeatures {
  releases?: boolean
  news?: boolean
  blog?: boolean
  projects?: boolean
  gallery?: boolean
  video?: boolean
  radio?: boolean
  shop?: boolean
}

export function buildNav(lang: 'en' | 'ru', features?: LegacyNavFeatures): Array<[string, string]> {
  const f = features ?? {}
  return NAV_ORDER.filter((href) => {
    const key = NAV_FEATURE_KEY[href]
    if (!key) return true
    return f[key] !== false
  }).map((href) => [href, NAV_LABELS[lang][href]])
}

const STRINGS: Record<
  'en' | 'ru',
  {
    releases: string
    note: string
    titleSuffix: string
    tracks: string
    download: string
    downloadFull: string
    preview: string
    back: string
    playlist: string
    stream: string
  }
> = {
  en: {
    releases: 'Releases',
    note: 'Minimal text mode — JavaScript and heavy styling are skipped for compatibility with your device.',
    titleSuffix: 'text mode',
    tracks: 'Tracks',
    download: 'download',
    downloadFull: 'download WAV (full)',
    preview: 'preview OGG',
    back: 'Back to releases',
    playlist: 'playlist (m3u)',
    stream: 'stream (m3u8)',
  },
  ru: {
    releases: 'Релизы',
    note: 'Облегчённая текстовая версия — JavaScript и тяжёлые стили отключены ради совместимости с вашим устройством.',
    titleSuffix: 'текстовый режим',
    tracks: 'Треки',
    download: 'скачать',
    downloadFull: 'скачать WAV (полный)',
    preview: 'превью OGG',
    back: 'К релизам',
    playlist: 'плейлист (m3u)',
    stream: 'поток (m3u8)',
  },
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildLegacyPage(options: LegacyPageOptions): LegacyPageResult {
  const { level, pathname, origin, siteName, releases, lang } = options
  const s = STRINGS[lang]
  const nav = buildNav(lang)

  const navHtml = nav
    .map(([href, label]) => {
      const isCurrent = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/')
      const link = `<a href="${href}">${escapeHtml(label)}</a>`
      return isCurrent ? `<strong>${link}</strong>` : link
    })
    .join(' ')
  const releaseRows = releases.map((r) => {
    const date = r.releaseDate ? `<span class="date">(${escapeHtml(r.releaseDate.slice(0, 10))})</span>` : ''
    return `        <li><a href="/music/${escapeHtml(r.slug)}">${escapeHtml(r.albumName)}</a> ${date}</li>`
  })
  const releaseRowsLevel0 = releases.map((r) => {
    const date = r.releaseDate ? ` — ${escapeHtml(r.releaseDate.slice(0, 10))}` : ''
    return `    <li><a href="/music/${escapeHtml(r.slug)}">${escapeHtml(r.albumName)}</a>${date}</li>`
  })

  if (level === 'level-0') {
    const html = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//WAPFORUM//DTD XHTML Mobile 1.0//EN" "http://www.wapforum.org/DTD/xhtml-mobile10.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" class="level-0">
<head>
<meta http-equiv="Content-Type" content="application/vnd.wap.xhtml+xml; charset=UTF-8"/>
<meta name="viewport" content="width=device-width; initial-scale=1.0"/>
<meta name="description" content="${escapeHtml(siteName)} — text only"/>
<title>${escapeHtml(siteName)}</title>
</head>
<body bgcolor="#07070c" text="#d4d4dc" link="#8f7cff" style="font-family: Arial, Helvetica, sans-serif; font-size: 15px; padding: 10px;">
<h3 style="margin-top: 0;">${escapeHtml(siteName)}</h3>
<p>${navHtml}</p>
<h4>${escapeHtml(s.releases)}</h4>
<ul>
${releaseRowsLevel0.join('\n')}
</ul>
<p style="color: #8a8a9c; font-size: 12px;">${escapeHtml(s.note)}</p>
</body>
</html>
`
    return { html, contentType: 'application/vnd.wap.xhtml+xml; charset=utf-8' }
  }

  const html = `<!doctype html>
<html lang="${lang}" class="${level}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta name="description" content="${escapeHtml(siteName)} — ${escapeHtml(s.titleSuffix)}"/>
<link rel="canonical" href="${escapeHtml(origin + (pathname === '/' ? '/' : pathname))}"/>
<title>${escapeHtml(siteName)} — ${escapeHtml(s.titleSuffix)}</title>
<link rel="stylesheet" href="/core.css"/>
<style>
${CORE_STYLES}
</style>
</head>
<body>
<main class="main">
<h1>${escapeHtml(siteName)}</h1>
<p class="nav">${navHtml}</p>
<h2>${escapeHtml(s.releases)}</h2>
<ul class="releases">
${releaseRows.join('\n')}
</ul>
<p class="note">${escapeHtml(s.note)}</p>
</main>
</body>
</html>
`
  return { html, contentType: 'text/html; charset=utf-8' }
}

export interface LegacyReleaseTrack {
  title: string
  index?: number
  sourceUrl?: string
  previewUrl?: string
  streamUrl?: string
  duration?: number
}

export interface LegacyReleasePageOptions {
  level: ClientLevel
  siteName: string
  lang: 'en' | 'ru'
  musicBackUrl: string
  features?: LegacyNavFeatures
  release: {
    slug: string
    albumName: string
    artist?: string
    releaseType?: string
    releaseDate?: string
    notes?: string
    coverUrl?: string
    playlistM3uUrl?: string
    tracks?: LegacyReleaseTrack[]
  }
}

/**
 * Extract a release slug from `/music/<slug>`, `/en/music/<slug>` or
 * `/ru/music/<slug>` (but not from `/music/tag/<x>`). Returns null for any
 * other path.
 */
export function extractReleaseSlug(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean)
  for (let i = 0; i < parts.length - 1; i++) {
    if (parts[i] === 'music' && parts[i + 1] && !parts[i + 2]) {
      try {
        return decodeURIComponent(parts[i + 1])
      } catch {
        return parts[i + 1]
      }
    }
  }
  return null
}

export function formatDuration(seconds?: number): string {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return ''
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

function inlineMarkup(s: string): string {
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
  return s
}

/**
 * Tiny markdown-lite renderer for content bodies: headings, bold, italic,
 * links, unordered/ordered lists and paragraphs. HTML is escaped first.
 */
export function renderLegacyMarkdown(input: string): string {
  const escaped = escapeHtml(input).replace(/\r\n/g, '\n').trim()
  const out: string[] = []
  let list: 'ul' | 'ol' | null = null
  const closeList = () => {
    if (list) {
      out.push(`</${list}>`)
      list = null
    }
  }
  for (const rawLine of escaped.split('\n')) {
    const line = rawLine.trim()
    if (!line) {
      closeList()
      continue
    }
    const heading = line.match(/^#{1,4}\s+(.+)$/)
    if (heading) {
      closeList()
      out.push(`<h3>${inlineMarkup(heading[1])}</h3>`)
      continue
    }
    const ul = line.match(/^[-*]\s+(.+)$/)
    const ol = line.match(/^\d+[.)]\s+(.+)$/)
    if (ul || ol) {
      const type: 'ul' | 'ol' = ul ? 'ul' : 'ol'
      if (list !== type) {
        closeList()
        out.push(`<${type}>`)
        list = type
      }
      out.push(`<li>${inlineMarkup((ul ?? ol)![1])}</li>`)
      continue
    }
    closeList()
    out.push(`<p>${inlineMarkup(line)}</p>`)
  }
  closeList()
  return out.join('\n')
}

export function buildLegacyReleasePage(options: LegacyReleasePageOptions): LegacyPageResult {
  const { level, lang, musicBackUrl, release } = options
  const s = STRINGS[lang]
  const nav = buildNav(lang, options.features)

  const navHtml = nav
    .map(([href, label]) => {
      const isCurrent = href === '/music'
      const link = `<a href="${href}">${escapeHtml(label)}</a>`
      return isCurrent ? `<strong>${link}</strong>` : link
    })
    .join(' ')

  const metaBits = [
    escapeHtml(release.artist ?? ''),
    release.releaseDate ? escapeHtml(release.releaseDate) : '',
    release.releaseType ? escapeHtml(release.releaseType) : '',
  ].filter(Boolean)
  const meta = metaBits.length > 0 ? `<p class="meta">${metaBits.join(' · ')}</p>` : ''

  const cover = release.coverUrl
    ? `<p class="cover"><img src="${escapeHtml(release.coverUrl)}" alt="${escapeHtml(release.albumName)}"/></p>`
    : ''

  const notes = release.notes ? renderLegacyMarkdown(release.notes) : ''

  const trackRows = (release.tracks ?? [])
    .filter((t) => t.title)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((t, idx) => {
      const n = t.index ?? idx + 1
      const wav = t.sourceUrl ? escapeHtml(t.sourceUrl) : ''
      const preview = t.previewUrl ? escapeHtml(t.previewUrl) : ''
      const stream = t.streamUrl ? escapeHtml(t.streamUrl) : ''
      const dur = formatDuration(t.duration)
      let audio = ''
      if (wav || preview) {
        const srcs = `${wav ? `<source src="${wav}" type="audio/wav"/>` : ''}${preview ? `<source src="${preview}" type="audio/ogg"/>` : ''}`
        audio = `\n      <audio controls preload="none">${srcs}<a href="${wav || preview}">${escapeHtml(s.download)}</a></audio>`
      }
      const dl = [
        wav ? `<a href="${wav}">${escapeHtml(s.downloadFull)}</a>` : '',
        preview ? `<a href="${preview}">${escapeHtml(s.preview)}</a>` : '',
        stream ? `<a href="${stream}">${escapeHtml(s.stream)}</a>` : '',
      ]
        .filter(Boolean)
        .join(' · ')
      return `    <li>
      <strong>${n}. ${escapeHtml(t.title)}</strong>${dur ? `<span class="track-meta"> (${dur})</span>` : ''}${audio}
      ${dl ? `<span class="track-links">${dl}</span>` : ''}
    </li>`
    })
    .join('\n')

  const playlist = release.playlistM3uUrl
    ? `<p><a href="${escapeHtml(release.playlistM3uUrl)}">${escapeHtml(s.playlist)}</a></p>`
    : ''

  const html = `<!doctype html>
<html lang="${lang}" class="${level}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta name="description" content="${escapeHtml(release.albumName)} — ${escapeHtml(s.titleSuffix)}"/>
<title>${escapeHtml(release.albumName)} — ${escapeHtml(options.siteName)}</title>
<link rel="stylesheet" href="/core.css"/>
<style>
${CORE_STYLES}
</style>
</head>
<body>
<main class="main">
<h1>${escapeHtml(release.albumName)}</h1>
<p class="nav">${navHtml}</p>
${meta}
${cover}
${notes}
<h2>${escapeHtml(s.tracks)}</h2>
<ul class="tracks">
${trackRows}
</ul>
${playlist}
<p class="back"><a href="${escapeHtml(musicBackUrl)}">&laquo; ${escapeHtml(s.back)}</a></p>
<p class="note">${escapeHtml(s.note)}</p>
</main>
</body>
</html>
`
  return { html, contentType: 'text/html; charset=utf-8' }
}