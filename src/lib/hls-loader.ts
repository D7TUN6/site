import type { Loader, LoaderCallbacks, LoaderConfiguration, LoaderContext, LoaderStats, LoaderResponse } from 'hls.js'

type HlsLightModule = typeof import('hls.js/light')

let _hlsModule: HlsLightModule | null = null

export async function getHlsLight(): Promise<HlsLightModule['default']> {
  if (!_hlsModule) _hlsModule = await import('hls.js/light')
  return _hlsModule.default
}

const CACHE_NAME = 'hls-segments-v1'
const CACHEABLE_EXT = /\.m3u8(\?|$)/i

function makeStats(): LoaderStats {
  return {
    aborted: false, loaded: 0, retry: 0, total: 0, chunkCount: 0, bwEstimate: 0,
    loading: { start: 0, end: 0, first: 0 },
    parsing: { start: 0, end: 0 },
    buffering: { start: 0, end: 0, first: 0 },
  }
}

export class CachedHlsLoader implements Loader<LoaderContext> {
  private _aborted = false
  private _controller: AbortController | null = null

  stats: LoaderStats = makeStats()
  context!: LoaderContext

  get maxBufferSize() { return 0 }
  get maxBufferLength() { return 0 }

  async load(context: LoaderContext, _config: LoaderConfiguration, callbacks: LoaderCallbacks<LoaderContext>) {
    this.context = context
    this._aborted = false
    const url = context.url

    if (CACHEABLE_EXT.test(url)) {
      try {
        const cache = await caches.open(CACHE_NAME)
        const cached = await cache.match(url)
        if (cached) {
          const blob = await cached.blob()
          const stats = makeStats()
          stats.loaded = blob.size
          stats.total = blob.size
          stats.chunkCount = 1
          this.stats = stats
          callbacks.onSuccess({ url, data: blob } as unknown as LoaderResponse, stats, context, null)
          return
        }
      } catch {}
    }

    this._controller = new AbortController()
    try {
      const response = await fetch(url, { signal: this._controller.signal })
      if (this._aborted) return
      const blob = await response.blob()
      const total = Number(response.headers.get('content-length') ?? blob.size)
      const stats = makeStats()
      stats.loaded = blob.size
      stats.total = total
      stats.chunkCount = 1
      this.stats = stats
      if (response.ok && CACHEABLE_EXT.test(url)) {
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(url, new Response(blob, { headers: response.headers }))
        }).catch(() => {})
      }
      callbacks.onSuccess({ url, data: blob } as unknown as LoaderResponse, stats, context, null)
    } catch (err) {
      if (this._aborted) {
        callbacks.onAbort?.(this.stats, context, null)
      } else {
        callbacks.onError?.({ code: 0, text: err instanceof Error ? err.message : 'Fetch error' }, context, null, this.stats)
      }
    }
  }

  abort() {
    this._aborted = true
    this._controller?.abort()
    this._controller = null
  }

  destroy() {
    this.abort()
  }
}

export function createCachedHlsConfig(): { loader?: typeof CachedHlsLoader } {
  if (typeof caches === 'undefined') return {}
  return { loader: CachedHlsLoader }
}
