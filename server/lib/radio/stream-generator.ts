import { open, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { exists, probeAudioDuration } from '../media-convert.js'
import { isTrackLocked } from '../release-availability.js'

const ROOT = process.cwd()
const RADIO_DIR = path.join(ROOT, 'public', 'media', 'radio')
export const CATALOG_FILE = path.join(RADIO_DIR, '.catalog.json')
export const PLAYLIST_FILE = path.join(RADIO_DIR, 'playlist.m3u8')
// Legacy HLS artifacts retired by the native-ogg migration — removed once.
export const LEGACY_SEGMENTS_DIR = path.join(RADIO_DIR, 'segments')
export const LEGACY_STREAM_FILE = path.join(RADIO_DIR, 'stream.m3u8')
// Guards against concurrent timeline rebuilds. pm2 runs the server in
// cluster mode, so an in-process flag alone is not enough.
const REGEN_LOCK_FILE = path.join(RADIO_DIR, '.regen.lock')
const REGEN_LAST_RUN_FILE = path.join(RADIO_DIR, '.last-regen')
// A lock older than this belongs to a crashed/finished run and may be stolen.
const REGEN_LOCK_STALE_MS = 12 * 3_600_000
// Do not re-shuffle the catalog metadata more often than this unless forced.
const REGEN_MIN_INTERVAL_MS = 6 * 3_600_000

export type RadioScheduleSlot = { day: string; start: string; end: string; label: string }

export type RadioState = {
  isLive: boolean
  listeners: number
  currentTrack: string | null
  streamUrl: string
  schedule: RadioScheduleSlot[]
  trackCount: number
  regeneratedAt: string | null
}

export type TimelineEntry = {
  title: string
  album: string
  artist: string
  coverUrl: string
  /** Server-relative URL of the source audio (used to build the m3u8 playlist). */
  sourceUrl: string
  duration: number
  startOffset: number
}

export type NowPlayingEntry = {
  title: string
  album: string
  artist: string
  coverUrl: string | null
  /** Server-clock epoch (ms) at which the current track began airing. */
  startTimestamp: number
  /** Total track duration in seconds. */
  duration: number
  /** Seconds elapsed into the track (derived from startTimestamp/duration). */
  elapsed: number
  /** Up to 10 scheduled tracks following the current one. */
  upcoming: { title: string; artist: string; album: string; coverUrl: string; duration: number }[]
  /** 'live' = confirmed via icecast metadata, 'estimated' = timeline heuristic. */
  source: 'live' | 'estimated'
}

type ManifestTrack = { index?: number; title: string; sourceUrl: string | null; duration?: number | null; previewable?: boolean }
type ManifestRelease = {
  sourceDirName?: string
  albumName?: string
  artist?: string
  coverUrl?: string
  coverPreviewUrl?: string
  releaseDate?: string
  tracks: ManifestTrack[]
}

export const radioState = {
  schedule: [] as RadioScheduleSlot[],
  lastRegeneratedAt: null as string | null,
  currentTimeline: [] as TimelineEntry[],
  totalDuration: 0,
  isRegenerating: false,
  regeneratedAtEpoch: 0,
  /** Populated by NowPlayingTracker (server/lib/radio/now-playing.ts). */
  nowPlaying: null as NowPlayingEntry | null,
}

let scheduleMissingLogged = false

export async function loadSchedule() {
  try {
    const raw = await readFile(path.join(RADIO_DIR, 'schedule.json'), 'utf-8')
    radioState.schedule = JSON.parse(raw) as RadioScheduleSlot[]
  } catch (err) {
    const missing = (err as NodeJS.ErrnoException)?.code === 'ENOENT'
    // /api/radio/state polls this on every request; only warn once so a
    // missing optional file does not flood the logs.
    if (!missing) console.warn('failed to load radio schedule', err)
    else if (!scheduleMissingLogged) { scheduleMissingLogged = true; console.warn('radio schedule.json not found (optional), using empty schedule') }
    radioState.schedule = []
  }
}

async function readManifest(manifestPath: string): Promise<ManifestRelease[]> {
  const raw = await readFile(manifestPath, 'utf8')
  const parsed = JSON.parse(raw) as { releases?: ManifestRelease[] }
  return Array.isArray(parsed.releases) ? parsed.releases : []
}

async function trackDuration(release: ManifestRelease, track: ManifestTrack): Promise<number> {
  if (typeof track.duration === 'number' && track.duration > 0) return track.duration
  const abs = path.resolve(ROOT, 'public', (track.sourceUrl ?? '').replace(/^\/+/, ''))
  return probeAudioDuration(abs).catch(() => 0)
}

/**
 * Rebuild the radio *catalog metadata* (ordered timeline of every on-air track).
 *
 * The heavy part of the old design — ffmpeg re-encoding of the whole catalog
 * into HLS VOD segments — is gone: Liquidsoap now broadcasts live Ogg from the
 * same source files, so the server only needs the timeline for now-playing
 * lookups (title → album/cover/duration + upcoming). Guarded by a single-flight
 * flag, a cross-process lock file and a minimum interval between runs.
 */
export async function regenerateRadioStream(manifestPath: string, opts: { force?: boolean } = {}): Promise<boolean> {
  if (radioState.isRegenerating) {
    console.log('radio: regeneration already running in this process — skipping')
    return false
  }
  radioState.isRegenerating = true
  let lockAcquired = false
  try {
    if (!opts.force) {
      if (!(await tryAcquireRegenLock())) {
        console.log('radio: another process holds the regeneration lock — skipping')
        return false
      }
      lockAcquired = true
      if (radioState.regeneratedAtEpoch > 0 && Date.now() - radioState.regeneratedAtEpoch < REGEN_MIN_INTERVAL_MS) {
        console.log('radio: last regeneration is recent — skipping')
        return false
      }
      const marker = Number((await readFile(REGEN_LAST_RUN_FILE, 'utf8').catch(() => '')) || 0)
      if (marker > 0 && Date.now() - marker < REGEN_MIN_INTERVAL_MS) {
        console.log('radio: last regeneration (marker) is recent — skipping')
        return false
      }
    } else {
      lockAcquired = await tryAcquireRegenLock()
    }
    await runTimelineRebuild(manifestPath)
    await writeFile(REGEN_LAST_RUN_FILE, String(Date.now()), 'utf8').catch(() => {})
    return true
  } finally {
    radioState.isRegenerating = false
    if (lockAcquired) await rm(REGEN_LOCK_FILE, { force: true }).catch(() => {})
  }
}

async function runTimelineRebuild(manifestPath: string) {
  const releases = await readManifest(manifestPath)
  const candidates: { title: string; album: string; artist: string; coverUrl: string; sourceUrl: string; duration: number }[] = []

  for (const release of releases) {
    if (!Array.isArray(release.tracks)) continue
    const sorted = [...release.tracks].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    const album = release.albumName || release.sourceDirName || ''
    const artist = release.artist || 'D7TUN6'
    const coverUrl = release.coverPreviewUrl || release.coverUrl || ''
    for (const track of sorted) {
      if (!track.sourceUrl) continue
      if (isTrackLocked(release, track)) continue
      const abs = path.resolve(ROOT, 'public', track.sourceUrl.replace(/^\/+/, ''))
      if (await exists(abs)) {
        const duration = await trackDuration(release, track)
        if (duration <= 0) continue
        candidates.push({ title: track.title, album, artist, coverUrl, sourceUrl: track.sourceUrl, duration })
      }
    }
  }

  if (candidates.length === 0) return

  // Shuffle — the airplay order (Liquidsoap shuffles its own copy of the same
  // catalogue independently; the timeline serves as a lookup table, so order is
  // approximate for the "upcoming" panel).
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]]
  }

  const timeline: TimelineEntry[] = []
  let offset = 0
  for (const c of candidates) {
    timeline.push({ ...c, startOffset: offset })
    offset += c.duration
  }

  radioState.currentTimeline = timeline
  radioState.totalDuration = offset
  radioState.regeneratedAtEpoch = Date.now()

  const generatedAt = new Date().toISOString()
  const trackNames = timeline.map((t) => t.title)
  const catalogData = {
    tracks: trackNames, count: trackNames.length, generatedAt,
    totalDuration: offset, regeneratedAtEpoch: radioState.regeneratedAtEpoch,
    timeline,
  }
  await writeFile(CATALOG_FILE, JSON.stringify(catalogData, null, 2), 'utf-8')

  // Liquidsoap fetches this titled playlist (EXTINF → icecast icy metadata
  // "Artist - Title") from the site and broadcasts it live as Ogg. Keeping it
  // regenerated here guarantees it stays in sync with the timeline's track set.
  await writeRadioPlaylist(timeline)

  try {
    await writeFile(path.join(RADIO_DIR, 'index.mdx'),
      `---
tracks:\n${trackNames.map((t) => `  - ${t}`).join('\n')}
schedule:\n${radioState.schedule.map((s) => `  - day: "${s.day}"\n    start: "${s.start}"\n    end: "${s.end}"\n    label: "${s.label}"`).join('\n')}
---
`, 'utf-8')
  } catch (err) { console.error('radio index.mdx write failed', err) }

  radioState.lastRegeneratedAt = generatedAt
  console.log(`radio: timeline regenerated (${timeline.length} tracks, ${Math.round(offset / 60)} min)`)
}

async function writeRadioPlaylist(timeline: TimelineEntry[]) {
  try {
    const base = (process.env.RADIO_PLAYLIST_BASE || 'http://127.0.0.1:3001').replace(/\/+$/, '')
    const lines = timeline.map((t) => {
      const artist = t.artist || 'D7TUN6'
      const extinf = `#EXTINF:${Math.max(1, Math.round(t.duration * 1000))},${artist} - ${t.title.replace(/[,]/g, '')}`
      return `${extinf}\n${base}${t.sourceUrl}`
    })
    await writeFile(PLAYLIST_FILE, `#EXTM3U\n${lines.join('\n')}\n`, 'utf-8')
  } catch (err) {
    console.error('radio playlist write failed', err)
  }
}

async function acquireLockFile(): Promise<boolean> {
  let fd: Awaited<ReturnType<typeof open>> | null = null
  try {
    fd = await open(REGEN_LOCK_FILE, 'wx')
  } catch {
    return false
  }
  try {
    await fd.writeFile(String(process.pid), 'utf8')
  } finally {
    await fd.close().catch(() => {})
  }
  return true
}

async function tryAcquireRegenLock(): Promise<boolean> {
  if (await acquireLockFile()) return true
  const st = await stat(REGEN_LOCK_FILE).catch(() => null)
  if (!st || Date.now() - st.mtimeMs <= REGEN_LOCK_STALE_MS) return false
  console.log(`radio: stealing stale regeneration lock (age ${Math.round((Date.now() - st.mtimeMs) / 60000)} min)`)
  await rm(REGEN_LOCK_FILE, { force: true })
  return acquireLockFile()
}