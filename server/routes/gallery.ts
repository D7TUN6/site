import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { Elysia } from 'elysia'
import type { DatabaseSync } from '../lib/sqlite.js'
import type { GalleryEntry } from '../../src/types/content.js'
import { parseFrontmatter } from '../lib/frontmatter.js'
import { galleryCacheEvents, GALLERY_INVALIDATE_EVENT } from '../lib/gallery-cache.js'
import { DedupeCache, MemoryCache } from '../lib/in-memory-cache.js'

const ROOT = process.cwd()
const GALLERY_DIR = path.join(ROOT, 'public', 'media', 'gallery')

const galleryCache = new MemoryCache<GalleryEntry[]>(Infinity)
const galleryDedupe = new DedupeCache<GalleryEntry[]>()

galleryCacheEvents.on(GALLERY_INVALIDATE_EVENT, () => {
  galleryCache.invalidate()
})

async function loadAllEntries(): Promise<GalleryEntry[]> {
  let dirs: import('node:fs').Dirent[]
  try {
    dirs = await readdir(GALLERY_DIR, { withFileTypes: true })
  } catch {
    return []
  }
  const directories = dirs.filter((d) => d.isDirectory())
  const entries = await Promise.all(directories.map(async (dirent) => {
    const slug = dirent.name
    const mdxPath = path.join(GALLERY_DIR, slug, 'index.mdx')
    try {
      const raw = await readFile(mdxPath, 'utf-8')
      const attrs = parseFrontmatter(raw)
      return {
        slug,
        title: String(attrs.title ?? slug),
        date: String(attrs.date ?? ''),
        tags: Array.isArray(attrs.tags) ? (attrs.tags as string[]) : [],
        images: Array.isArray(attrs.images) ? (attrs.images as string[]) : [],
        cover: attrs.cover ? (String(attrs.cover).startsWith('/') ? String(attrs.cover) : `/media/gallery/${slug}/${String(attrs.cover)}`) : '',
      } satisfies GalleryEntry
    } catch {
      return null
    }
  }))
  const result = entries.filter((e): e is GalleryEntry => e !== null)
  result.sort((a, b) => b.date.localeCompare(a.date))
  return result
}

function getGalleryEntries(): Promise<GalleryEntry[]> {
  const cached = galleryCache.get()
  if (cached) return Promise.resolve(cached)
  return galleryDedupe.getOrCreate('gallery', async () => {
    const entries = await loadAllEntries()
    galleryCache.set(entries)
    return entries
  })
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

export function createGalleryRouter({ db }: { db: DatabaseSync }) {
  return new Elysia({ prefix: '/api/gallery' })
    .get('/entries', async ({ query }) => {
      try {
        const artistSlug = typeof query.artist_slug === 'string' ? query.artist_slug.trim() : ''
        const artistIdParam = typeof query.artist_id === 'string' ? query.artist_id.trim() : ''

        if (!artistSlug && !artistIdParam) {
          const entries = await getGalleryEntries()
          return { ok: true, entries }
        }

        const aid = getartistid(db, artistSlug || undefined, artistIdParam || undefined)
        if (!aid) return { ok: true, entries: [] }

        const rows = db.prepare(
          "select slug, title, date, tags, cover, images from photos where artist_id = ? order by date desc"
        ).all(aid) as Array<{ slug: string; title: string; date: string; tags: string; cover: string; images: string }>

        const entries = rows.map((r) => ({
          slug: r.slug,
          title: r.title,
          date: r.date,
          tags: (() => { try { return JSON.parse(r.tags) as string[] } catch { return [] } })(),
          images: (() => { try { return JSON.parse(r.images) as string[] } catch { return [] } })(),
          cover: r.cover,
        }))

        return { ok: true, entries }
      } catch (err) {
        console.error('gallery entries failed', err)
        return { error: 'Unable to load gallery' }
      }
    })
    .get('/entries/:s', async ({ params, query, set }) => {
      try {
        const slug = params.s
        const artistSlug = typeof query.artist_slug === 'string' ? query.artist_slug.trim() : ''
        const artistIdParam = typeof query.artist_id === 'string' ? query.artist_id.trim() : ''

        if (!artistSlug && !artistIdParam) {
          const entries = await getGalleryEntries()
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
          "select slug, title, date, tags, cover, images from photos where artist_id = ? and slug = ? limit 1"
        ).get(aid, slug) as { slug: string; title: string; date: string; tags: string; cover: string; images: string } | undefined
        if (!row) {
          set.status = 404
          return { error: 'Not found' }
        }

        return {
          ok: true,
          entry: {
            slug: row.slug,
            title: row.title,
            date: row.date,
            tags: (() => { try { return JSON.parse(row.tags) as string[] } catch { return [] } })(),
            images: (() => { try { return JSON.parse(row.images) as string[] } catch { return [] } })(),
            cover: row.cover,
          },
        }
      } catch (err) {
        console.error('gallery entry failed', err)
        set.status = 500
        return { error: 'Unable to load entry' }
      }
    })
}
