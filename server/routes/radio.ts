import { readFile, rm } from 'node:fs/promises'
import { PassThrough, Readable } from 'node:stream'
import { Elysia } from 'elysia'
import {
  CATALOG_FILE,
  LEGACY_SEGMENTS_DIR,
  LEGACY_STREAM_FILE,
  radioState,
  loadSchedule,
  type RadioState,
} from '../lib/radio/stream-generator.js'
import { ensureTimelineFresh, loadTimeline, maybeRegenerateIfStale, startPeriodicRegeneration } from '../lib/radio/timeline.js'
import { getNowPlayingInfo, startNowPlayingTracker } from '../lib/radio/now-playing.js'
import { activeListeners, getClientIp, listenerKey } from '../lib/radio/listener-tracker.js'

const ICECAST_URL = (process.env.RADIO_ICECAST_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '')
export const RADIO_MOUNT = process.env.RADIO_MOUNT || '/stream.ogg'

async function removeLegacyHlsArtifacts() {
  // Retire the old VOD HLS generation: segments dir + static playlist. The
  // catalog (timeline) is the only thing the new flow persists.
  await Promise.allSettled([
    rm(LEGACY_SEGMENTS_DIR, { recursive: true, force: true }),
    rm(LEGACY_STREAM_FILE, { force: true }),
  ])
}

export function initRadio(manifestPath: string) {
  void removeLegacyHlsArtifacts()
  void loadTimeline().catch((err) => console.error('radio: timeline load failed', err))
  startNowPlayingTracker()
  startPeriodicRegeneration(manifestPath)
}

export function createRadioRouter({ manifestPath }: { manifestPath: string }) {
  // Live now-playing. The tracker derives startTimestamp from the icecast
  // metadata change + catalog match, so the client can simulate position
  // locally without polling a hypothetical HLS position. Both the new GET
  // and the legacy POST shape are served for compatibility.
  const nowPlayingPayload = () => {
    void ensureTimelineFresh()
    const info = getNowPlayingInfo()
    if (!info) return null
    return {
      ok: true,
      ...info,
      regeneratedAt: radioState.lastRegeneratedAt,
      regeneratedAtEpoch: radioState.regeneratedAtEpoch,
      totalDuration: radioState.totalDuration,
    }
  }

  return new Elysia({ prefix: '/api/radio' })
    .get('/state', async () => {
      await loadSchedule()

      let trackCount = 0
      let regeneratedAt: string | null = radioState.lastRegeneratedAt
      try {
        const raw = await readFile(CATALOG_FILE, 'utf-8')
        const catalog = JSON.parse(raw) as { count: number; generatedAt: string }
        trackCount = catalog.count
        regeneratedAt = regeneratedAt ?? catalog.generatedAt
      } catch (err) { console.error('radio state catalog read failed', err) }

      const state: RadioState = {
        isLive: true,
        listeners: activeListeners.size,
        currentTrack: getNowPlayingInfo()?.title ?? null,
        streamUrl: '/api/radio/stream',
        schedule: radioState.schedule,
        trackCount,
        regeneratedAt,
      }
      return { ok: true, ...state }
    })

    // Live stream proxy. The native <audio> element plays the same-origin URL;
    // Icecast binds loopback and the request headers stay clean of CORS. Any
    // upstream outage surfaces as a body-stream error → the client reconnects.
    .get('/stream', ({ set }) => {
      const upstream = ICECAST_URL + RADIO_MOUNT
      const body = new PassThrough()
      const controller = new AbortController()
      set.headers['content-type'] = 'audio/ogg'
      set.headers['cache-control'] = 'no-cache, no-store, must-revalidate'

      const abortTimer = setTimeout(() => controller.abort(), 7_000)
      fetch(upstream, {
        signal: controller.signal,
        headers: { 'Icy-MetaData': '0' },
      })
        .then((up) => {
          clearTimeout(abortTimer)
          if (!up.ok || !up.body) {
            body.destroy(new Error(`radio upstream status ${up.status}`))
            return
          }
          const ctype = up.headers.get('content-type')
          if (ctype) set.headers['content-type'] = ctype
          const src = Readable.fromWeb(up.body as unknown as import('node:stream/web').ReadableStream)
          body.on('close', () => { controller.abort(); src.destroy() })
          src.on('error', (err) => body.destroy(err))
          src.pipe(body)
        })
        .catch((err) => {
          clearTimeout(abortTimer)
          body.destroy(err instanceof Error ? err : new Error(String(err)))
        })

      return new Response(body as unknown as BodyInit)
    })

    .get('/tracks', async () => {
      await ensureTimelineFresh()
      return { ok: true, tracks: radioState.currentTimeline.map((e) => e.title) }
    })

    .post('/listeners', ({ body, request, server }) => {
      const b = (body || {}) as Record<string, unknown>
      const delta = typeof b.delta === 'number' ? b.delta : 0
      const ip = getClientIp({ request, server })
      // Prefer the client's stable per-tab id: a single listener can appear
      // under several addresses and an IP-keyed map then counts it more than
      // once. Fall back to IP for older clients.
      const key = listenerKey(b.id, ip)
      if (delta >= 0) {
        // Refresh TTL on every heartbeat (delta=0) and on start (delta>0)
        activeListeners.set(key, Date.now())
        if (delta > 0) {
          // Lazy timeline refresh: if the manifest changed since the last
          // catalog write, re-shuffle in the background.
          void maybeRegenerateIfStale(manifestPath).catch((err) => console.error('lazy radio regeneration failed', err))
        }
      } else {
        activeListeners.delete(key)
      }

      return { ok: true, listeners: activeListeners.size }
    })

    .get('/now-playing', ({ set }) => {
      const payload = nowPlayingPayload()
      if (!payload) {
        set.status = 404
        return { ok: false }
      }
      return payload
    })
    .post('/now-playing', ({ set }) => {
      const payload = nowPlayingPayload()
      if (!payload) {
        set.status = 404
        return { ok: false }
      }
      return payload
    })
}