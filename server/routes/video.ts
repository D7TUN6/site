import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { Elysia } from 'elysia'
import type { DatabaseSync } from '../lib/sqlite.js'
import type { VideoEntry } from '../../src/types/content.js'
import { parseFrontmatter } from '../lib/frontmatter.js'

const ROOT = process.cwd()
const VIDEO_DIR = path.join(ROOT, 'public', 'media', 'video')

function parseVideoFrontmatter(raw: string): Record<string, unknown> {
  const attrs = parseFrontmatter(raw)
  const sourcesMatch = raw.match(/^sources:\n((?:[ \t].*(?:\n|$))*)/m)
  if (sourcesMatch) {
    const block = sourcesMatch[1]
    const sources: Array<Record<string, string>> = []
    let current: Record<string, string> | null = null
    for (const line of block.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      if (trimmed.startsWith('- ')) {
        if (current) sources.push(current)
        current = {}
        const rest = trimmed.slice(2)
        if (rest.includes(', ')) {
          for (const part of rest.split(',').map((s) => s.trim())) {
            const [k, ...v] = part.split(':')
            if (k && v.length) current[k.trim()] = v.join(':').trim()
          }
        } else {
          const sep = rest.indexOf(':')
          if (sep !== -1) current[rest.slice(0, sep).trim()] = rest.slice(sep + 1).trim()
        }
      } else if (current) {
        const sep = trimmed.indexOf(':')
        if (sep !== -1) current[trimmed.slice(0, sep).trim()] = trimmed.slice(sep + 1).trim()
      }
    }
    if (current) sources.push(current)
    attrs.sources = sources as unknown[]
  }
  return attrs
}

async function loadVideoEntries(): Promise<VideoEntry[]> {
  let dirs: import('node:fs').Dirent[]
  try {
    dirs = await readdir(VIDEO_DIR, { withFileTypes: true })
  } catch {
    return []
  }
  const directories = dirs.filter((d) => d.isDirectory())
  const entries = await Promise.all(directories.map(async (dirent) => {
    const slug = dirent.name
    const mdxPath = path.join(VIDEO_DIR, slug, 'index.mdx')
    try {
      const raw = await readFile(mdxPath, 'utf-8')
      const attrs = parseVideoFrontmatter(raw)
      const contentBody = raw.replace(/^---[\s\S]*?---\n?/, '').trim()
      return {
        slug,
        title: String(attrs.title ?? slug),
        date: String(attrs.date ?? ''),
        duration: typeof attrs.duration === 'number' ? attrs.duration : null,
        thumbnail: attrs.thumbnail ? (String(attrs.thumbnail).startsWith('/') ? String(attrs.thumbnail) : `/media/video/${slug}/videos/${String(attrs.thumbnail)}`) : '',
        sources: Array.isArray(attrs.sources) ? (attrs.sources as Array<{ url: string; type: string; resolution?: string }>) : [],
        description: attrs.description ? String(attrs.description) : contentBody || '',
      } satisfies VideoEntry
    } catch {
      return null
    }
  }))
  const result = entries.filter((e): e is VideoEntry => e !== null)
  result.sort((a, b) => b.date.localeCompare(a.date))
  return result
}

function getartistid(db: DatabaseSync, slug?: string, id?: string): number | null {
  if (slug) {
    const row = db.prepare("select id from artists where slug = ? and status = 'approved'").get(slug) as { id: number } | undefined
    return row?.id ?? null
  }
  if (id) {
    const n = Number(id)
    if (!Number.isFinite(n)) return null
    const row = db.prepare("select id from artists where id = ? and status = 'approved'").get(n) as { id: number } | undefined
    return row?.id ?? null
  }
  const row = db.prepare("select id from artists where slug = 'd7tun6' and status = 'approved'").get() as { id: number } | undefined
  return row?.id ?? null
}

export function createVideoRouter({ db }: { db: DatabaseSync }) {
  return new Elysia({ prefix: '/api/video' })
    .get('/entries', async ({ query, set }) => {
      try {
        const artistSlug = typeof query.artist_slug === 'string' ? query.artist_slug.trim() : ''
        const artistIdParam = typeof query.artist_id === 'string' ? query.artist_id.trim() : ''

        if (!artistSlug && !artistIdParam) {
          const entries = await loadVideoEntries()
          return { ok: true, entries }
        }

        const aid = getartistid(db, artistSlug || undefined, artistIdParam || undefined)
        if (!aid) return { ok: true, entries: [] }

        const rows = db.prepare(
          "select slug, title, date, duration, thumbnail, description from videos where artist_id = ? order by date desc"
        ).all(aid) as Array<{ slug: string; title: string; date: string; duration: number | null; thumbnail: string; description: string }>

        return { ok: true, entries: rows }
      } catch (err) {
        console.error('video entries failed', err)
        set.status = 500
        return { error: 'Unable to load video entries' }
      }
    })
    .get('/entries/:s', async ({ params, query, set }) => {
      try {
        const slug = params.s
        const artistSlug = typeof query.artist_slug === 'string' ? query.artist_slug.trim() : ''
        const artistIdParam = typeof query.artist_id === 'string' ? query.artist_id.trim() : ''

        if (!artistSlug && !artistIdParam) {
          const entries = await loadVideoEntries()
          const entry = entries.find((e) => e.slug === slug)
          if (!entry) {
            set.status = 404
            return { error: 'Not found' }
          }
          return { ok: true, entry }
        }

        const aid = getartistid(db, artistSlug || undefined, artistIdParam || undefined)
        if (!aid) {
          set.status = 404
          return { error: 'Not found' }
        }

        const row = db.prepare(
          "select slug, title, date, duration, thumbnail, description from videos where artist_id = ? and slug = ? limit 1"
        ).get(aid, slug) as { slug: string; title: string; date: string; duration: number | null; thumbnail: string; description: string } | undefined
        if (!row) {
          set.status = 404
          return { error: 'Not found' }
        }

        return { ok: true, entry: row }
      } catch (err) {
        console.error('video entry failed', err)
        set.status = 500
        return { error: 'Unable to load entry' }
      }
    })
}
