import { mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import path from 'node:path'
import busboy from 'busboy'
import express from 'express'
import { enforceSameOrigin } from '../../lib/request-origin.js'
import { requireAdmin } from '../../middleware/require-auth.js'
import { ROOT } from './shared.js'
import { runFfmpeg, spawnRebuild, exists, probeAudioDuration } from '../../lib/media-convert.js'

const RADIO_ROOT = path.join(ROOT, 'public', 'media', 'radio')
const AUDIO_EXTS = new Set(['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.wma'])

type ManifestTrack = { index?: number; title: string; sourceUrl: string | null }
type ManifestRelease = {
  sourceDirName?: string
  albumName?: string
  coverUrl?: string
  coverPreviewUrl?: string
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

export async function collectAllRadioSources(manifestPath: string, shuffle = true): Promise<{ files: string[]; names: string[]; albums: string[]; coverUrls: string[] }> {
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

export async function regenerateHlsStream(manifestPath: string) {
  await mkdir(path.join(RADIO_ROOT, 'segments'), { recursive: true })

  const { files: sourceFiles, names: trackNames, albums, coverUrls } = await collectAllRadioSources(manifestPath)
  if (sourceFiles.length === 0) return

  const n = sourceFiles.length
  const filterParts = sourceFiles.map((_, i) =>
    `[${i}:a]aformat=sample_fmts=s16:sample_rates=44100:channel_layouts=stereo[a${i}]`
  )
  const concatInputs = sourceFiles.map((_, i) => `[a${i}]`).join('')
  const inputs = sourceFiles.flatMap((f) => ['-i', f])

  await runFfmpeg([
    '-y', ...inputs,
    '-filter_complex', `${filterParts.join(';')};${concatInputs}concat=n=${n}:v=0:a=1[a]`,
    '-map', '[a]',
    '-c:a', 'aac', '-b:a', '128k',
    '-f', 'hls', '-hls_time', '10', '-hls_list_size', '0',
    '-hls_base_url', '/media/radio/segments/',
    '-hls_segment_filename', path.join(RADIO_ROOT, 'segments', 'segment_%03d.ts'),
    path.join(RADIO_ROOT, 'stream.m3u8'),
  ])

  // probe durations and build timeline
  const durations = await Promise.all(sourceFiles.map((f) => probeAudioDuration(f).catch(() => 0)))
  const timeline: Array<{ title: string; album: string; artist: string; coverUrl: string; duration: number; startOffset: number }> = []
  let offset = 0
  for (let i = 0; i < trackNames.length; i++) {
    const d = durations[i] || 0
    timeline.push({
      title: trackNames[i],
      album: albums[i] || '',
      artist: 'D7TUN6',
      coverUrl: coverUrls[i] || '',
      duration: d,
      startOffset: offset,
    })
    offset += d
  }

  try {
    await writeFile(
      path.join(RADIO_ROOT, '.catalog.json'),
      JSON.stringify({
        tracks: trackNames, count: trackNames.length, generatedAt: new Date().toISOString(),
        totalDuration: offset, regeneratedAtEpoch: Date.now(), timeline,
      }, null, 2),
      'utf-8',
    )
  } catch (e) { console.error('radio catalog write failed', e) }

}

export function createAdminRadioRouter({ manifestPath }: { manifestPath: string }) {
  const router = express.Router()

  router.get('/', requireAdmin, async (_req, res) => {
    try {
      const { names: trackNames } = await collectAllRadioSources(manifestPath, false)
      const schedule = await readScheduleJson()
      return res.status(200).json({ ok: true, tracks: trackNames, schedule })
    } catch (err) {
      console.error('admin radio list failed', err)
      return res.status(500).json({ error: 'Unable to list radio data' })
    }
  })

  router.post('/schedule', enforceSameOrigin, requireAdmin, async (req, res) => {
    const schedule = Array.isArray(req.body?.schedule) ? req.body.schedule as Array<{ day: string; start: string; end: string; label: string }> : []
    if (schedule.length === 0) return res.status(400).json({ error: 'schedule is required' })

    try {
      await writeScheduleJson(schedule)
      const { names: releaseTrackNames } = await collectAllRadioSources(manifestPath, false)
      await writeRadioMdx([], releaseTrackNames, schedule)
      spawnRebuild()
      return res.json({ ok: true })
    } catch (err) {
      console.error('admin radio schedule failed', err)
      return res.status(500).json({ error: 'Unable to update schedule' })
    }
  })

  router.post('/regenerate-stream', enforceSameOrigin, requireAdmin, async (_req, res) => {
    try {
      await regenerateHlsStream(manifestPath)
      return res.json({ ok: true })
    } catch (err) {
      console.error('admin radio regenerate stream failed', err)
      return res.status(500).json({ error: 'Unable to regenerate stream' })
    }
  })

  return router
}