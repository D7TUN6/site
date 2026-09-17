import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Elysia } from 'elysia'
import { enforceSameOrigin } from '../../lib/request-origin.js'
import { requireAdmin } from '../../middleware/require-auth.js'
import { ROOT } from './shared.js'
import { exists, spawnRebuild } from '../../lib/media-convert.js'
import { isTrackLocked } from '../../lib/release-availability.js'
import { regenerateRadioStream } from '../../lib/radio/stream-generator.js'

const RADIO_ROOT = path.join(ROOT, 'public', 'media', 'radio')

type ManifestTrack = { index?: number; title: string; sourceUrl: string | null; previewable?: boolean }
type ManifestRelease = {
  sourceDirName?: string
  albumName?: string
  coverUrl?: string
  coverPreviewUrl?: string
  releaseDate?: string
  tracks: ManifestTrack[]
}

async function readManifest(manifestPath: string): Promise<ManifestRelease[]> {
  try {
    const raw = await readFile(manifestPath, 'utf8')
    const parsed = JSON.parse(raw) as { releases?: ManifestRelease[] }
    return Array.isArray(parsed.releases) ? parsed.releases : []
  } catch { return [] }
}

async function writeScheduleJson(schedule: Array<{ day: string; start: string; end: string; label: string }>) {
  await writeFile(path.join(RADIO_ROOT, 'schedule.json'), JSON.stringify(schedule, null, 2), 'utf-8')
}

async function readScheduleJson(): Promise<Array<{ day: string; start: string; end: string; label: string }>> {
  try {
    const raw = await readFile(path.join(RADIO_ROOT, 'schedule.json'), 'utf-8')
    return JSON.parse(raw) as Array<{ day: string; start: string; end: string; label: string }>
  } catch {
    return []
  }
}

async function writeRadioMdx(uploadedTracks: string[], releaseTrackNames: string[], schedule: Array<{ day: string; start: string; end: string; label: string }>) {
  const allTracks = [...releaseTrackNames, ...uploadedTracks.map((f) => `[uploaded] ${f}`)]
  const tracksStr = allTracks.map((t) => `  - ${t}`).join('\n')
  const scheduleStr = schedule.map((s) => `  - day: "${s.day}"\n    start: "${s.start}"\n    end: "${s.end}"\n    label: "${s.label}"`).join('\n')
  const mdx = `---
tracks:
${tracksStr}
schedule:
${scheduleStr}
---
`
  await writeFile(path.join(RADIO_ROOT, 'index.mdx'), mdx, 'utf-8')
}

async function collectAllRadioSources(manifestPath: string, shuffle = true): Promise<{ files: string[]; names: string[]; albums: string[]; coverUrls: string[] }> {
  const releases = await readManifest(manifestPath)
  const files: string[] = []
  const names: string[] = []
  const albums: string[] = []
  const coverUrls: string[] = []

  for (const release of releases) {
    if (!Array.isArray(release.tracks)) continue
    const sorted = [...release.tracks].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    const album = release.albumName || release.sourceDirName || ''
    const coverUrl = release.coverPreviewUrl || release.coverUrl || ''
    for (const track of sorted) {
      if (!track.sourceUrl) continue
      if (isTrackLocked(release, track)) continue
      const abs = path.resolve(ROOT, 'public', track.sourceUrl.replace(/^\/+/, ''))
      if (await exists(abs)) {
        files.push(abs)
        names.push(track.title)
        albums.push(album)
        coverUrls.push(coverUrl)
      }
    }
  }

  if (shuffle && files.length > 0) {
    const indices = Array.from({ length: files.length }, (_, i) => i)
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]]
    }
    const shuffledFiles = indices.map((i) => files[i])
    const shuffledNames = indices.map((i) => names[i])
    const shuffledAlbums = indices.map((i) => albums[i])
    const shuffledCovers = indices.map((i) => coverUrls[i])
    return { files: shuffledFiles, names: shuffledNames, albums: shuffledAlbums, coverUrls: shuffledCovers }
  }

  return { files, names, albums, coverUrls }
}

async function regenerateHlsStream(manifestPath: string) {
  // Delegate to the guarded generator: single-flight + cross-process lock,
  // locked-track filtering and atomic tmp-swap of segments/stream.m3u8.
  // Encoding takes many minutes, so this is fire-and-forget.
  const started = regenerateRadioStream(manifestPath, { force: true })
  started.catch((err) => console.error('admin radio regeneration failed', err))
  return started
}

export function createAdminRadioRouter({ manifestPath }: { manifestPath: string }) {
  return new Elysia({ prefix: '/api/admin/radio' })
    .get('/', async ({ set }) => {
      try {
        const { names: trackNames } = await collectAllRadioSources(manifestPath, false)
        const schedule = await readScheduleJson()
        return { ok: true, tracks: trackNames, schedule }
      } catch (err) {
        console.error('admin radio list failed', err)
        set.status = 500
        return { error: 'Unable to list radio data' }
      }
    }, { beforeHandle: requireAdmin })
    .post('/schedule', async ({ body, set }) => {
      const b = (body || {}) as Record<string, unknown>
      const schedule = Array.isArray(b.schedule) ? b.schedule as Array<{ day: string; start: string; end: string; label: string }> : []
      if (schedule.length === 0) {
        set.status = 400
        return { error: 'schedule is required' }
      }

      try {
        await writeScheduleJson(schedule)
        const { names: releaseTrackNames } = await collectAllRadioSources(manifestPath, false)
        await writeRadioMdx([], releaseTrackNames, schedule)
        spawnRebuild()
        return { ok: true }
      } catch (err) {
        console.error('admin radio schedule failed', err)
        set.status = 500
        return { error: 'Unable to update schedule' }
      }
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
    .post('/regenerate-stream', async ({ set }) => {
      try {
        await regenerateHlsStream(manifestPath)
        return { ok: true }
      } catch (err) {
        console.error('admin radio regenerate stream failed', err)
        set.status = 500
        return { error: 'Unable to regenerate stream' }
      }
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
}