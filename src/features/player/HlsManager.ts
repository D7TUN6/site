import type { ErrorData } from 'hls.js'
import type { GlobalPlayerTrack } from '@/player/queue.js'
import { createCachedHlsConfig, getHlsLight } from '@/lib/hls-loader.js'

type HlsModule = Awaited<ReturnType<typeof getHlsLight>>
type HlsInstance = InstanceType<HlsModule>

export class HlsManager {
  private _hls: HlsInstance | null = null
  private _hlsConstructor: HlsModule | null = null

  get currentLevel(): number {
    return this._hls?.currentLevel ?? -1
  }

  get hls(): HlsInstance | null {
    return this._hls
  }

  destroy() {
    this._hls?.destroy()
    this._hls = null
  }

  async attachHlsTrack(
    track: GlobalPlayerTrack,
    audio: HTMLAudioElement,
    flushPendingAutoplay: () => void,
    onFallback: (url: string) => void,
  ): Promise<boolean> {
    if (!track.streamUrl) return false
    if (!this._hlsConstructor) this._hlsConstructor = await getHlsLight()
    const HlsCtor = this._hlsConstructor
    if (!HlsCtor.isSupported()) {
      if (track.fallbackUrl) onFallback(track.fallbackUrl)
      return false
    }
    this.destroy()
    this._hls = new HlsCtor({
      enableWorker: true,
      liveSyncDuration: 8,
      liveMaxLatencyDuration: 60,
      maxBufferHole: 3,
      ...createCachedHlsConfig(),
    })
    this._hls.on(HlsCtor.Events.MANIFEST_PARSED, () => {
      flushPendingAutoplay()
    })
    this._hls.on(HlsCtor.Events.ERROR, (_e: unknown, data: ErrorData) => {
      if (!data.fatal) return
      if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR) {
        this._hls?.recoverMediaError()
        return
      }
      // For NETWORK_ERROR: reload the stream source instead of destroying.
      // hls.js will re-fetch the m3u8 and resume from the live edge.
      try {
        if (track.streamUrl) this._hls?.loadSource(track.streamUrl)
      } catch {
        this.destroy()
        if (track.fallbackUrl) onFallback(track.fallbackUrl)
      }
    })
    if (audio.src) audio.removeAttribute('src')
    this._hls.attachMedia(audio)
    this._hls.loadSource(track.streamUrl)
    return true
  }

  setLevel(level: number) {
    if (this._hls) this._hls.currentLevel = level
  }
}
