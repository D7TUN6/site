import { For, createEffect, createSignal, onCleanup } from 'solid-js'
import type Hls from 'hls.js'
import { getHls } from '@/lib/hls-full-loader.js'
import { VideoControls } from '@/components/VideoControls.js'
import { isFullscreen, requestFullscreen, exitFullscreen, videoElementFullscreen, type WebkitDocument, type WebkitElement } from '@/lib/fullscreen'

export function CustomVideoPlayer(props: {
  sources: Array<{ url: string; type: string; resolution?: string }>
  poster?: string
  onTimeUpdate?: (current: number, duration: number) => void
}) {
  let videoRef: HTMLVideoElement | undefined
  let containerRef: HTMLDivElement | undefined
  let hlsInstance: Hls | null = null
  const VOLUME_KEY = 'video-volume'
  const MUTED_KEY = 'video-muted'
  function loadVolume() { try { const v = parseFloat(localStorage.getItem(VOLUME_KEY) || ''); return isFinite(v) ? Math.max(0, Math.min(1, v)) : 1 } catch { return 1 } }
  function loadMuted() { try { return localStorage.getItem(MUTED_KEY) === 'true' } catch { return false } }
  const [playing, setPlaying] = createSignal(false)
  const [currentTime, setCurrentTime] = createSignal(0)
  const [duration, setDuration] = createSignal(0)
  const [buffered, setBuffered] = createSignal(0)
  const [volume, setVolume] = createSignal(loadVolume())
  const [muted, setMuted] = createSignal(loadMuted())
  const [fullscreen, setFullscreen] = createSignal(false)
  const [seekRatio, setSeekRatio] = createSignal<number | null>(null)
  const [showControls, setShowControls] = createSignal(true)
  const [qualityOpen, setQualityOpen] = createSignal(false)
  const [hlsLevels, setHlsLevels] = createSignal<Array<{ index: number; label: string }>>([])
  const [currentLevel, setCurrentLevel] = createSignal(-1)
  let controlsTimer: ReturnType<typeof setTimeout> | null = null

  // iOS 15 webkit / iPhone 6s: ensure playsinline attributes via DOM
  createEffect(() => {
    if (!videoRef) return
    try {
      videoRef.setAttribute('playsinline', '')
      videoRef.setAttribute('webkit-playsinline', '')
      videoRef.setAttribute('x5-playsinline', '')
      videoRef.setAttribute('x-webkit-airplay', 'allow')
    } catch {}
  })

  createEffect(() => {
    if (!videoRef) return
    setPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setBuffered(0)
    setSeekRatio(null)
    setHlsLevels([])
    setCurrentLevel(-1)
    setQualityOpen(false)
    const hlsSources = props.sources.filter((s) => s.type === 'application/vnd.apple.mpegurl' || s.type === 'application/x-mpegurl')
    const mp4Sources = props.sources.filter((s) => s.type !== 'application/vnd.apple.mpegurl' && s.type !== 'application/x-mpegurl')
    // Reset previous
    if (hlsInstance) { try { hlsInstance.destroy() } catch {} ; hlsInstance = null }
    if (videoRef) {
      try { videoRef.removeAttribute('src'); videoRef.load() } catch {}
    }
    if (hlsSources.length > 0) {
      const hlsUrl = hlsSources[0].url
      // Check native HLS first (Safari / iOS WebKit)
      const canNative = (() => {
        try { return !!videoRef.canPlayType('application/vnd.apple.mpegurl') || !!videoRef.canPlayType('application/x-mpegURL') } catch { return false }
      })()
      getHls().then((Hls) => {
        if (!videoRef) return
        if (Hls.isSupported()) {
          hlsInstance = new Hls({ enableWorker: true, lowLatencyMode: false })
          hlsInstance.loadSource(hlsUrl)
          hlsInstance.attachMedia(videoRef)
          hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
            if (!hlsInstance) return
            const levels = hlsInstance.levels.map((l, i) => ({
              index: i,
              label: `${l.height}p`
            })).filter((l) => !l.label.startsWith('0'))
            setHlsLevels(levels)
          })
          hlsInstance.on(Hls.Events.ERROR, (_evt, data) => {
            if (data?.fatal && canNative) {
              try { hlsInstance?.destroy(); hlsInstance = null } catch {}
              try { videoRef.src = hlsUrl; videoRef.load() } catch {}
            }
          })
        } else if (canNative || mp4Sources.length === 0) {
          // Native HLS (iPhone 6s Safari iOS 15) – use direct src, keep <source> fallback
          try {
            videoRef.src = hlsUrl
            videoRef.load()
          } catch {}
        }
      }).catch(() => {
        if (canNative) { try { videoRef.src = hlsUrl; videoRef.load() } catch {} }
      })
      onCleanup(() => { if (hlsInstance) { try { hlsInstance.destroy() } catch {} ; hlsInstance = null } })
    } else if (mp4Sources.length > 0) {
      // no HLS, let <source> tags handle mp4
      try { videoRef.load() } catch {}
    }
  })

  createEffect(() => {
    if (!videoRef) return
    videoRef.volume = volume()
    videoRef.muted = muted()
  })

  onCleanup(() => {
    if (controlsTimer) clearTimeout(controlsTimer)
    if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null }
  })

  function onPlayPause() {
    if (!videoRef) return
    if (videoRef.paused) videoRef.play().catch(() => {})
    else videoRef.pause()
  }

  function onVideoPlay() { setPlaying(true) }
  function onVideoPause() { setPlaying(false) }
  function onVideoTimeUpdate() {
    if (!videoRef) return
    setCurrentTime(videoRef.currentTime)
    setDuration(videoRef.duration || 0)
    if (videoRef.buffered.length > 0) {
      setBuffered(videoRef.buffered.end(videoRef.buffered.length - 1))
    }
    props.onTimeUpdate?.(videoRef.currentTime, videoRef.duration || 0)
  }
  function onVideoLoadedMeta() {
    if (!videoRef) return
    const d = videoRef.duration
    if (Number.isFinite(d) && d > 0 && d !== Infinity) setDuration(d)
  }

  function onVideoError() {
    if (!videoRef) return
    const err = videoRef.error
    // Fallback to mp4 if HLS failed and mp4 exists
    const mp4 = props.sources.find(s => s.type === 'video/mp4' || s.type === 'video/webm')
    if (err && mp4 && videoRef.src !== mp4.url) {
      try {
        if (hlsInstance) { try { hlsInstance.destroy() } catch {} ; hlsInstance = null }
        videoRef.src = mp4.url
        videoRef.load()
        videoRef.play().catch(() => {})
      } catch {}
    }
  }

  function showControlsTemporarily() {
    setShowControls(true)
    if (controlsTimer) clearTimeout(controlsTimer)
    controlsTimer = setTimeout(() => { if (playing()) setShowControls(false) }, 3000)
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLButtonElement) return
    switch (e.key) {
      case 'k':
      case 'K':
      case ' ':
        e.preventDefault()
        onPlayPause()
        break
      case 'f':
      case 'F':
        e.preventDefault()
        if (!containerRef) return
        {
          const doc = document as WebkitDocument
          const el = containerRef as WebkitElement
          if (isFullscreen(doc)) {
            exitFullscreen(doc)
            setFullscreen(false)
          } else {
            const canRequest = !!(el.requestFullscreen ?? el.webkitRequestFullscreen ?? el.webkitEnterFullscreen)
            if (canRequest) {
              requestFullscreen(el)
            } else if (!videoElementFullscreen(videoRef)) {
              return
            }
            setFullscreen(true)
          }
        }
        break
      case 'm':
      case 'M':
        e.preventDefault()
        if (!videoRef) return
        videoRef.muted = !videoRef.muted
        setMuted(videoRef.muted)
        try { localStorage.setItem(MUTED_KEY, String(videoRef.muted)) } catch {}
        break
      case 'ArrowLeft':
        e.preventDefault()
        if (!videoRef) return
        videoRef.currentTime = Math.max(0, (videoRef.currentTime || 0) - 5)
        break
      case 'ArrowRight':
        e.preventDefault()
        if (!videoRef) return
        videoRef.currentTime = Math.min(videoRef.duration || 0, (videoRef.currentTime || 0) + 5)
        break
      case 'ArrowUp':
        e.preventDefault()
        if (!videoRef) return
        videoRef.volume = Math.min(1, (videoRef.volume || 0) + 0.1)
        setVolume(videoRef.volume)
        try { localStorage.setItem(VOLUME_KEY, String(videoRef.volume)) } catch {}
        if (videoRef.volume > 0 && videoRef.muted) {
          videoRef.muted = false
          setMuted(false)
          try { localStorage.setItem(MUTED_KEY, 'false') } catch {}
        }
        break
      case 'ArrowDown':
        e.preventDefault()
        if (!videoRef) return
        videoRef.volume = Math.max(0, (videoRef.volume || 0) - 0.1)
        setVolume(videoRef.volume)
        try { localStorage.setItem(VOLUME_KEY, String(videoRef.volume)) } catch {}
        break
    }
  }

  createEffect(() => {
    const handler = (e: KeyboardEvent) => onKeyDown(e)
    document.addEventListener('keydown', handler)
    onCleanup(() => document.removeEventListener('keydown', handler))
  })

  createEffect(() => {
    function onFullscreenChange() {
      const doc = document as WebkitDocument
      setFullscreen(isFullscreen(doc))
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    document.addEventListener('webkitfullscreenchange', onFullscreenChange as EventListener)
    document.addEventListener('webkitendfullscreen', onFullscreenChange as EventListener)
    onCleanup(() => {
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange as EventListener)
      document.removeEventListener('webkitendfullscreen', onFullscreenChange as EventListener)
    })
  })

  function showControlsFromInteraction() {
    showControlsTemporarily()
    setShowControls(true)
  }

  function handleContainerClick(_e: MouseEvent) {
    // On iOS tap should toggle play if controls not blocking; controls handle own clicks via stopPropagation
    // Keep for accessibility – actual play triggered via video onClick as well
    showControlsFromInteraction()
  }

  return (
    <div
      ref={containerRef}
      class="custom-video-player"
      tabIndex={0}
      onMouseMove={showControlsTemporarily}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => { if (playing()) setShowControls(false) }}
      onTouchStart={showControlsFromInteraction}
      onTouchMove={showControlsTemporarily}
      onClick={handleContainerClick}
    >
      <video
        ref={videoRef}
        class="custom-video-player-video"
        preload="metadata"
        poster={props.poster}
        playsinline
        webkit-playsinline
        x5-playsinline
        x-webkit-airplay="allow"
        // @ts-expect-error non-standard SolidJS video prop
        disablePictureInPicture={false}
        muted={muted()}
        controls={false}
        crossOrigin="anonymous"
        onPlay={onVideoPlay}
        onPause={onVideoPause}
        onTimeUpdate={onVideoTimeUpdate}
        onLoadedMetadata={onVideoLoadedMeta}
        onLoadedData={onVideoLoadedMeta}
        onCanPlay={onVideoLoadedMeta}
        onError={onVideoError}
        onClick={onPlayPause}
        onTouchEnd={(e) => { e.preventDefault(); showControlsFromInteraction(); onPlayPause() }}
      >
        <For each={props.sources}>
          {(src) => <source src={src.url} type={src.type} />}
        </For>
      </video>

      <VideoControls
        videoRef={videoRef}
        containerRef={containerRef}
        hlsInstance={hlsInstance}
        onPlayPause={onPlayPause}
        playing={playing}
        currentTime={currentTime}
        duration={duration}
        buffered={buffered}
        volume={volume}
        muted={muted}
        fullscreen={fullscreen}
        hlsLevels={hlsLevels}
        currentLevel={currentLevel}
        showControls={showControls}
        qualityOpen={qualityOpen}
        seekRatio={seekRatio}
        setSeekRatio={setSeekRatio}
        setCurrentLevel={setCurrentLevel}
        setQualityOpen={setQualityOpen}
        setMuted={setMuted}
        setVolume={setVolume}
        setFullscreen={setFullscreen}
      />
    </div>
  )
}
