import type { DatabaseSync } from './sqlite.js'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const ROOT = process.cwd()
const MANIFEST_PATH = path.join(ROOT, 'src', 'generated', 'release-manifest.json')

interface ManifestRelease {
  slug?: string
  albumName?: string
  releaseDate?: string
  releaseType?: string
  hidden?: boolean
  genre?: { en?: string; ru?: string }
  notes?: string
  tracks?: Array<{
    index?: number
    title?: string
    duration?: number
    streamUrl?: string
    url?: string
    previewUrl?: string
    sourceUrl?: string
  }>
}

/**
 * Ensure every release in the build-time manifest exists in the DB.
 * Shared by migration.ts (startup) and loudness-scanner.ts (background).
 * Returns the number of releases inserted.
 */
export async function syncManifestToDb(db: DatabaseSync): Promise<number> {
  const now = Date.now()
  let rels: ManifestRelease[] = []
  try {
    const raw = await readFile(MANIFEST_PATH, 'utf-8')
    const manifest = JSON.parse(raw)
    rels = Array.isArray(manifest) ? manifest : (manifest.releases || [])
  } catch {
    return 0
  }

  const artistRow = db.prepare("SELECT id FROM artists WHERE slug = 'd7tun6'").get() as { id: number } | undefined
  if (!artistRow) return 0
  const artistid = artistRow.id

  let inserted = 0
  for (const rel of rels) {
    const slug = rel.slug || ''
    if (!slug) continue
    const existing = db.prepare('SELECT id FROM releases WHERE slug = ?').get(slug) as { id: number } | undefined
    if (existing) continue
    const r = db.prepare(
      "INSERT INTO releases (artist_id, slug, album_name, release_date, release_type, hidden, genre_en, genre_ru, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      artistid, slug, rel.albumName || '', rel.releaseDate || '', rel.releaseType || '',
      rel.hidden ? 1 : 0, rel.genre?.en || '', rel.genre?.ru || '', rel.notes || '', now, now
    )
    const releaseid = Number(r.lastInsertRowid)
    if (Array.isArray(rel.tracks)) {
      for (const track of rel.tracks) {
        const ti = typeof track.index === 'number' ? track.index : 0
        db.prepare(
          "INSERT INTO tracks (artist_id, release_id, track_index, title, duration, stream_url, preview_url, source_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(
          artistid, releaseid, ti, track.title || '',
          typeof track.duration === 'number' ? track.duration : null,
          track.streamUrl || track.url || '', track.previewUrl || null, track.sourceUrl || null, now
        )
      }
    }
    inserted++
  }

  // Remove orphan DB releases whose slug is not in the manifest
  const manifestSlugs = new Set(rels.map((r) => r.slug).filter(Boolean))
  const dbReleases = db.prepare('SELECT id, slug FROM releases').all() as Array<{ id: number; slug: string }>
  let removed = 0
  for (const dbRel of dbReleases) {
    if (!manifestSlugs.has(dbRel.slug)) {
      db.prepare('DELETE FROM tracks WHERE release_id = ?').run(dbRel.id)
      db.prepare('DELETE FROM releases WHERE id = ?').run(dbRel.id)
      removed++
    }
  }
  if (removed > 0) console.info(`manifest sync: removed ${removed} orphan releases from DB`)

  return inserted
}
