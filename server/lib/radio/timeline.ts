import { readFile, stat } from 'node:fs/promises'
import {
  CATALOG_FILE,
  radioState,
  type TimelineEntry,
} from './stream-generator.js'
import { regenerateRadioStream } from './stream-generator.js'
import { activeListeners } from './listener-tracker.js'

export async function loadTimeline() {
  try {
    const raw = await readFile(CATALOG_FILE, 'utf-8')
    const catalog = JSON.parse(raw) as {
      timeline?: TimelineEntry[]
      totalDuration?: number
      regeneratedAtEpoch?: number
    }
    if (Array.isArray(catalog.timeline)) radioState.currentTimeline = catalog.timeline
    if (typeof catalog.totalDuration === 'number') radioState.totalDuration = catalog.totalDuration
    if (typeof catalog.regeneratedAtEpoch === 'number') radioState.regeneratedAtEpoch = catalog.regeneratedAtEpoch
    const st = await stat(CATALOG_FILE).catch(() => null)
    lastCatalogMtimeMs = st?.mtimeMs ?? 0
  } catch (err) { console.error('loadTimeline failed', err) }
}

let lastCatalogMtimeMs = 0
export async function ensureTimelineFresh() {
  try {
    const st = await stat(CATALOG_FILE)
    if (st.mtimeMs !== lastCatalogMtimeMs) await loadTimeline()
  } catch { /* catalog not written yet */ }
}

/**
 * Idle-friendly: only re-shuffle the timeline while someone is listening.
 * The regeneration itself is cheap now (metadata only — no ffmpeg), so a
 * stale catalog gets refreshed lazily the moment a listener tunes in.
 */
export function startPeriodicRegeneration(manifestPath: string) {
  setInterval(async () => {
    if (!radioState.isRegenerating && activeListeners.size > 0) {
      await maybeRegenerateIfStale(manifestPath)
    }
  }, 3_600_000).unref()
}

export async function maybeRegenerateIfStale(manifestPath: string): Promise<boolean> {
  try {
    const catalogStat = await stat(CATALOG_FILE)
    const manifestStat = await stat(manifestPath)
    if (manifestStat.mtimeMs <= catalogStat.mtimeMs) return false
  } catch {
    // missing catalog counts as stale
  }
  const regenerated = await regenerateRadioStream(manifestPath)
  if (regenerated) {
    await loadTimeline()
  }
  return regenerated
}