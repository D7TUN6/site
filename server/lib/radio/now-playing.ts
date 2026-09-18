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

/**
 * Circular distance between two slots on a wrapped timeline, so "the next
 * track after the current one" keeps working across the round boundary.
 */
function circularDistance(a: number, b: number, length: number): number {
  const d = Math.abs(a - b)
  return Math.min(d, length - d)
}

/**
 * Pick the playlist occurrence that best matches the current airplay position.
 * With sequential airplay the observed title can repeat (e.g. the same title
 * in several releases); the calendar anchor tells us which instance is on air
 * right now instead of always picking the first one and announcing a queue
 * that belongs to a different part of the round.
 */
export function nearestOccurrence(indices: number[], anchor: number, length: number): number {
  if (indices.length === 0) return -1
  if (length <= 0) return indices[0]
  let best = indices[0]
  let bestDist = Infinity
  for (const index of indices) {
    const dist = circularDistance(index, anchor, length)
    if (dist < bestDist) {
      best = index
      bestDist = dist
    }
  }
  return best
}

/** Where the wall clock sits on the current timeline (used as a sniff anchor). */
function calendarAnchorIndex(): number {
  const tl = radioState.currentTimeline
  if (tl.length === 0 || radioState.totalDuration <= 0) return 0
  const epoch = radioState.regeneratedAtEpoch > 0
    ? radioState.regeneratedAtEpoch
    : (radioState.lastRegeneratedAt ? new Date(radioState.lastRegeneratedAt).getTime() : Date.now())
  const pos = ((Date.now() - epoch) / 1000) % radioState.totalDuration
  const idx = tl.findIndex((e) => pos >= e.startOffset && pos < e.startOffset + e.duration)
  return idx < 0 ? 0 : idx
}

// Liquidsoap tags the stream from the EXTINF playlist as "Artist - Title".
// The catalog matcher therefore tries "artist - title" first, then the bare
// title, then a contains-check so subtle punctuation differences still hit.
// When a title occurs more than once, prefer the instance that matches the
// current airplay position so "upcoming" follows the real queue.
function findTimelineEntry(titleHint: string): { entry: TimelineEntry; index: number } | null {
  const tl = radioState.currentTimeline
  if (tl.length === 0) return null
  const raw = normalizeTitle(titleHint)
  const exact: number[] = []
  const titleOnly: number[] = []
  const contains: number[] = []
  for (let i = 0; i < tl.length; i++) {
    const entry = tl[i]
    if (normalizeTitle(`${entry.artist} - ${entry.title}`) === raw) {
      exact.push(i)
    } else if (normalizeTitle(entry.title) === raw) {
      titleOnly.push(i)
    } else if (raw.length > 3 && normalizeTitle(entry.title).includes(raw)) {
      contains.push(i)
    }
  }
  const pool = exact.length > 0 ? exact : titleOnly.length > 0 ? titleOnly : contains
  const index = nearestOccurrence(pool, calendarAnchorIndex(), tl.length)
  if (index < 0) return null
  return { entry: tl[index], index }
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

/**
 * The timeline heuristic may seed a cold-start entry but must never displace a
 * live-confirmed one: the estimate is anchored to the server's own shuffled
 * timeline (regeneratedAtEpoch), which is unrelated to Liquidsoap's playout
 * order, so an estimate here is almost always the wrong track at the wrong
 * position. Only fill a gap — never replace confirmed on-air metadata.
 */
export function shouldEstimateOverride(current: NowPlayingEntry | null): boolean {
  return !current || current.source !== 'live'
}

/**
 * A live track is allowed to run well past its catalog duration (files are
 * longer than the manifest value, gapless metadata lag, ...), so only a
 * pathological overrun — the source restarted and re-aired the same title
 * after a gap — should reset the position. Judged on the *unclamped* wall
 * clock (elapsed is otherwise capped at duration by refreshElapsed) against a
 * tolerance of roughly 3x the catalog duration, and only for live entries.
 */
export function shouldResetOverrun(entry: NowPlayingEntry | null, wallElapsed: number): boolean {
  if (!entry || entry.source !== 'live' || entry.duration <= 0) return false
  const margin = Math.max(entry.duration * 2, entry.duration + 60)
  return wallElapsed > entry.duration + margin
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
      // observed one, or when the source clearly overran its known duration
      // (e.g. it restarted and re-aired the same title after a gap). Refresh the
      // live entry's elapsed on the wall clock first so the overrun decision is
      // made on real time — never on the duration-clamped display value.
      const changedByTitle = lastObservedTitle !== title
      let overran = false
      if (!changedByTitle && radioState.nowPlaying) {
        refreshElapsed(radioState.nowPlaying)
        overran = shouldResetOverrun(radioState.nowPlaying, (Date.now() - radioState.nowPlaying.startTimestamp) / 1000)
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
      }
    }
  } catch {
    // icecast unreachable — nothing to do, estimate path kicks in below
  }
  if (!ok && Date.now() - lastIcecastOkAt >= ESTIMATE_GRACE_MS) {
    // A status-endpoint outage must not displace the live-confirmed entry with
    // the shuffled-timeline heuristic: the estimate belongs to a different
    // playout order and would make the UI jump to a wrong track mid-song. Only
    // seed it when there is nothing live to show.
    if (shouldEstimateOverride(radioState.nowPlaying)) {
      const est = estimateNowPlaying()
      if (est) radioState.nowPlaying = est
    }
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