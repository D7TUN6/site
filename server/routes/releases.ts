import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { Elysia } from 'elysia'
import type { DatabaseSync } from '../lib/sqlite.js'
import { isPreOrder } from '../lib/release-availability.js'

const ROOT = process.cwd()
const MANIFEST_PATH = path.join(ROOT, 'src', 'generated', 'release-manifest.json')

type ManifestTrack = { index: number; title: string; duration?: number | null; url?: string; streamUrl?: string | null; sourceUrl?: string | null; previewable?: boolean; trackLoudness?: number | null; albumLoudness?: number | null }
type ManifestRelease = { slug: string; albumName?: string; artist?: string; releaseDate?: string; hidden?: boolean; tracks?: ManifestTrack[] }
type ManifestPayload = { releases: ManifestRelease[]; generatedAt?: string }

function enrichManifestWithLoudness(db: DatabaseSync, manifest: ManifestPayload) {
  const releases = manifest.releases
  if (!Array.isArray(releases)) return
  for (const release of releases) {
    // Fetch artist name for this release
    const artistRow = db.prepare(
      "SELECT a.name FROM releases r JOIN artists a ON a.id = r.artist_id WHERE r.slug = ?"
    ).get(release.slug) as { name: string } | undefined
    if (artistRow) release.artist = artistRow.name

    if (!Array.isArray(release.tracks)) continue
    // Fetch loudness for all tracks in this release
    const slug = release.slug
    const rows = db.prepare(
      "SELECT track_index, track_loudness, album_loudness FROM tracks WHERE release_id = (SELECT id FROM releases WHERE slug = ?)"
    ).all(slug) as Array<{ track_index: number; track_loudness: number | null; album_loudness: number | null }>
    const loudnessMap = new Map(rows.map((r) => [r.track_index, r]))
    // Compute album_loudness as average of all track_loudness values in this release
    const trackLoudnessValues = rows.map((r) => r.track_loudness).filter((v): v is number => v !== null)
    const albumLoudness = trackLoudnessValues.length > 0
      ? trackLoudnessValues.reduce((a, b) => a + b, 0) / trackLoudnessValues.length
      : null
    for (const track of release.tracks) {
      const loudness = loudnessMap.get(track.index)
      track.trackLoudness = loudness?.track_loudness ?? null
      track.albumLoudness = albumLoudness
    }
  }
}

/** Deep-clone manifest before enrichment to prevent cache pollution. */
function enrichManifestWithLoudnessCloned(db: DatabaseSync, manifest: ManifestPayload) {
  const cloned = { ...manifest, releases: manifest.releases.map((r) => ({ ...r, tracks: (r.tracks || []).map((t) => ({ ...t })) })) }
  enrichManifestWithLoudness(db, cloned)
  return cloned
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

export function createReleaseRouter({ db }: { db: DatabaseSync }) {
  let manifestCache: { data: ManifestPayload; mtimeMs: number } | null = null

  async function loadManifestCached(): Promise<ManifestPayload> {
    try {
      const { stat } = await import('node:fs/promises')
      const s = await stat(MANIFEST_PATH)
      if (manifestCache && manifestCache.mtimeMs === s.mtimeMs) return manifestCache.data
      const raw = await readFile(MANIFEST_PATH, 'utf-8')
      const data = JSON.parse(raw)
      manifestCache = { data, mtimeMs: s.mtimeMs }
      return data
    } catch {
      const raw = await readFile(MANIFEST_PATH, 'utf-8')
      return JSON.parse(raw)
    }
  }

  return new Elysia({ prefix: '/api/releases' })
    .get('/manifest', async ({ query, set }) => {
      try {
        const artistSlug = typeof query.artist_slug === 'string' ? query.artist_slug.trim() : ''
        const artistIdParam = typeof query.artist_id === 'string' ? query.artist_id.trim() : ''

        if (!artistSlug && !artistIdParam) {
          const manifest = await loadManifestCached()
          const enriched = enrichManifestWithLoudnessCloned(db, manifest)
          set.headers['cache-control'] = 'public, max-age=60, stale-while-revalidate=300'
          set.headers['etag'] = `"${manifest.generatedAt || ''}"`
          return enriched
        }

        const aid = getartistid(db, artistSlug || undefined, artistIdParam || undefined)
        if (!aid) return { releases: [] }

        const slugRows = db.prepare(
          "select slug from releases where artist_id = ?"
        ).all(aid) as Array<{ slug: string }>
        const allowedSlugs = new Set(slugRows.map((r) => r.slug))

        const manifest = await loadManifestCached() as { releases?: ManifestRelease[] }
        const filtered = (manifest.releases ?? []).filter((r) => allowedSlugs.has(r.slug))
        return { releases: filtered }
      } catch (err) {
        console.error('Failed to read release manifest:', err)
        set.status = 500
        return { error: 'Unable to read release manifest' }
      }
    })

    // Dynamic m3u playlist built from the CURRENT manifest — during pre-order it
    // only contains previewable (unlocked) tracks, never the full track list.
    .get('/:slug/playlist.m3u', async ({ params, request, set }) => {
      try {
        const slug = typeof params.slug === 'string' ? params.slug.trim() : ''
        const manifest = await loadManifestCached() as { releases?: ManifestRelease[] }
        const release = (manifest.releases ?? []).find((r) => r.slug === slug)
        if (!release || release.hidden) {
          set.status = 404
          return { error: 'Release not found' }
        }

        const preOrder = isPreOrder(release)
        const tracks = preOrder
          ? (release.tracks ?? []).filter((t) => t.previewable !== false)
          : (release.tracks ?? [])

        const protocol = new URL(request.url).protocol.replace(/:$/, '')
        const host = request.headers.get('host') ?? ''
        const base = `${protocol}://${host}`
        const lines = ['#EXTM3U']
        for (const t of tracks) {
          const dur = typeof t.duration === 'number' && Number.isFinite(t.duration) ? Math.round(t.duration) : -1
          lines.push(`#EXTINF:${dur},${t.title}`)
          const target = t.sourceUrl || t.url || t.streamUrl
          if (target) lines.push(target.startsWith('/') ? `${base}${encodeURI(target)}` : target)
        }

        set.headers['content-type'] = 'audio/x-mpegurl; charset=utf-8'
        set.headers['cache-control'] = 'no-cache'
        set.headers['content-disposition'] = `inline; filename="${slug}${preOrder ? '-preview' : ''}.m3u"`
        return lines.join('\n') + '\n'
      } catch (err) {
        console.error('Failed to build playlist:', err)
        set.status = 500
        return { error: 'Unable to build playlist' }
      }
    })
}
