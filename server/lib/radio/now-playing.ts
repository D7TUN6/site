import { radioState, type NowPlayingEntry, type TimelineEntry } from './stream-generator.js'

const ICECAST_STATUS_URL = process.env.RADIO_ICECAST_STATUS_URL || 'http://127.0.0.1:8000/status-json.xsl'
// Tight polling keeps the startTimestamp accurate; the request is a tiny
// loopback fetch, and the tracker only writes on change.
const POLL_INTERVAL_MS = 2_000
// If we cannot confirm what is on air, fall back to the timeline heuristic
// after a short grace period (so a transient icecast blip doesn't snap the
// now-playing metadata to a wrong estimate).
const ESTIMATE_GRACE_MS = 8_000

type IcecastSourceMeta = {
  title?: string
  listeners?: number
  [k: string]: unknown
}

let pollTimer: ReturnType<typeof setInterval> | null = null
let lastObservedTitle: string | null = null
let lastMatchedIndex = -1
let lastIcecastOkAt = 0

function normalizeTitle(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

// Liquidsoap tags the stream from the EXTINF playlist as "Artist - Title".
// The catalog matcher therefore tries "artist - title" first, then the bare
// title, then a contains-check so subtle punctuation differences still hit.
function findTimelineEntry(titleHint: string): { entry: TimelineEntry; index: number } | null {
  const tl = radioState.currentTimeline
  if (tl.length === 0) return null
  const raw = normalizeTitle(titleHint)
  let exact = -1
  let titleOnly = -1
  let contains = -1
  for (let i = 0; i < tl.length; i++) {
    const entry = tl[i]
    if (exact < 0 && normalizeTitle(`${entry.artist} - ${entry.title}`) === raw) exact = i
    if (titleOnly < 0 && normalizeTitle(entry.title) === raw) titleOnly = i
    if (contains < 0 && raw.length > 3 && normalizeTitle(entry.title).includes(raw)) contains = i
    if (exact >= 0 && titleOnly >= 0 && contains >= 0) break
  }
  if (exact >= 0) return { entry: tl[exact], index: exact }
  if (titleOnly >= 0) return { entry: tl[titleOnly], index: titleOnly }
  if (contains >= 0) return { entry: tl[contains], index: contains }
  return null
}

function upcoming(index: number, limit = 10) {
  const tl = radioState.currentTimeline
  const out: { title: string; artist: string; album: string; coverUrl: string; duration: number }[] = []
  const next = index + 1
  // If the current title matched a late occurrence, prefer a whisper of the
  // entries that follow it. Liquidsoap order shuffles independently, so this
  // is approximate — good enough for a "next up" panel.
  for (let i = next; i < tl.length && out.length < limit; i++) {
    out.push({ title: tl[i].title, artist: tl[i].artist, album: tl[i].album, coverUrl: tl[i].coverUrl, duration: tl[i].duration })
  }
  // Wrap if the match sat in the tail so the panel is never empty.
  for (let i = 0; i < index && out.length < limit; i++) {
    out.push({ title: tl[i].title, artist: tl[i].artist, album: tl[i].album, coverUrl: tl[i].coverUrl, duration: tl[i].duration })
  }
  return out
}

function buildLiveEntry(entry: TimelineEntry, index: number): NowPlayingEntry {
  const startTimestamp = Date.now()
  lastMatchedIndex = index
  return {
    title: entry.title,
    album: entry.album,
    artist: entry.artist || 'D7TUN6',
    coverUrl: entry.coverUrl || null,
    startTimestamp,
    duration: entry.duration,
    elapsed: 0,
    upcoming: upcoming(index),
    source: 'live',
  }
}

function estimateNowPlaying(): NowPlayingEntry | null {
  const tl = radioState.currentTimeline
  if (tl.length === 0 || radioState.totalDuration <= 0) return null
  const epoch = radioState.regeneratedAtEpoch > 0
    ? radioState.regeneratedAtEpoch
    : (radioState.lastRegeneratedAt ? new Date(radioState.lastRegeneratedAt).getTime() : Date.now())
  const pos = ((Date.now() - epoch) / 1000) % radioState.totalDuration
  const idx = tl.findIndex((e) => pos >= e.startOffset && pos < e.startOffset + e.duration)
  const entry = tl[idx < 0 ? 0 : idx]
  const elapsed = Math.max(0, pos - entry.startOffset)
  lastMatchedIndex = idx < 0 ? 0 : idx
  return {
    title: entry.title,
    album: entry.album,
    artist: entry.artist || 'D7TUN6',
    coverUrl: entry.coverUrl || null,
    startTimestamp: Date.now() - elapsed * 1000,
    duration: entry.duration,
    elapsed,
    upcoming: upcoming(lastMatchedIndex),
    source: 'estimated',
  }
}

function fallbackEntry(entry: TimelineEntry, index: number): NowPlayingEntry {
  return buildLiveEntry(entry, index)
}

async function pollIcecast(): Promise<void> {
  let ok = false
  try {
    const res = await fetch(ICECAST_STATUS_URL, { signal: AbortSignal.timeout(3_000) })
    if (!res.ok) throw new Error(`status ${res.status}`)
    const data = (await res.json()) as { icestats?: { source?: IcecastSourceMeta | IcecastSourceMeta[] } }
    const source = Array.isArray(data?.icestats?.source) ? data.icestats.source[0] : data?.icestats?.source
    const title = typeof source?.title === 'string' && source.title.trim() ? source.title.trim() : null
    if (title) {
      ok = true
      lastIcecastOkAt = Date.now()

      // A track counts as "changed" when the on-air title differs from the last
      // observed one, or when a catalog track simply overran its known duration
      // (the source may have restarted and re-aired the same title).
      const changedByTitle = lastObservedTitle !== title
      let overran = false
      if (radioState.nowPlaying && radioState.nowPlaying.duration > 0) {
        overran = radioState.nowPlaying.elapsed >= radioState.nowPlaying.duration + 10
      }
      if (changedByTitle || overran) {
        lastObservedTitle = title
        const match = findTimelineEntry(title)
        if (match) {
          radioState.nowPlaying = fallbackEntry(match.entry, match.index)
        } else {
          // Title not in the catalog (uploaded/unlisted track?) — split the
          // "Artist - Title" string liquidsoap sends and present it bare.
          radioState.nowPlaying = {
            title,
            album: 'live broadcast',
            artist: 'D7TUN6',
            coverUrl: null,
            startTimestamp: Date.now(),
            duration: 0,
            elapsed: 0,
            upcoming: [],
            source: 'live',
          }
        }
      } else {
        // Keep the current entry live but refresh its elapsed on stall-less
        // polls when a title overran already closed (source == catalog).
        if (radioState.nowPlaying) {
          refreshElapsed(radioState.nowPlaying)
        }
      }
    }
  } catch {
    // icecast unreachable — nothing to do, estimate path kicks in below
  }
  if (!ok && Date.now() - lastIcecastOkAt >= ESTIMATE_GRACE_MS) {
    const est = estimateNowPlaying()
    if (est) radioState.nowPlaying = est
  }
}

function refreshElapsed(entry: NowPlayingEntry) {
  const elapsed = (Date.now() - entry.startTimestamp) / 1000
  entry.elapsed = Math.max(0, Math.min(elapsed, entry.duration > 0 ? entry.duration : elapsed))
}

/** Recompute the elapsed from startTimestamp so callers always see a fresh value. */
export function getNowPlayingInfo(): NowPlayingEntry | null {
  if (!radioState.nowPlaying) {
    const est = estimateNowPlaying()
    if (est) radioState.nowPlaying = est
  }
  if (radioState.nowPlaying) refreshElapsed(radioState.nowPlaying)
  return radioState.nowPlaying
}

export function startNowPlayingTracker() {
  if (pollTimer) return
  void pollIcecast()
  pollTimer = setInterval(() => void pollIcecast(), POLL_INTERVAL_MS)
  pollTimer.unref?.()
}

export function stopNowPlayingTracker() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
}