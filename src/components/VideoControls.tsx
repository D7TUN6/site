import { For, Show, createMemo } from 'solid-js'
import type Hls from 'hls.js'
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, Settings } from 'lucide-solid'
import { isFullscreen, requestFullscreen, exitFullscreen, videoElementFullscreen, type WebkitDocument, type WebkitElement } from '@/lib/fullscreen'

function fmtTime(seconds: number | null): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function ratioFromPointer(event: PointerEvent, target: HTMLElement): number {
  const rect = target.getBoundingClientRect()
  if (rect.width <= 0) return 0
  return (event.clientX - rect.left) / rect.width
}

function ratioFromTouch(touch: Touch, target: HTMLElement): number {
  const rect = target.getBoundingClientRect()
  if (rect.width <= 0) return 0
  return (touch.clientX - rect.left) / rect.width
}

const SEEK_STEP = 5

export function VideoControls(props: {
  videoRef: HTMLVideoElement | undefined
  containerRef: HTMLDivElement | undefined
  hlsInstance: Hls | null
  onPlayPause: () => void
  playing: () => boolean
  currentTime: () => number
  duration: () => number
  buffered: () => number
  volume: () => number
  muted: () => boolean
  fullscreen: () => boolean
  hlsLevels: () => Array<{ index: number; label: string }>
  currentLevel: () => number
  showControls: () => boolean
  qualityOpen: () => boolean
  seekRatio: () => number | null
  setSeekRatio: (v: number | null) => void
  setCurrentLevel: (v: number) => void
  setQualityOpen: (v: boolean | ((prev: boolean) => boolean)) => boolean
  setMuted: (v: boolean | ((prev: boolean) => boolean)) => boolean
  setVolume: (v: number | ((prev: number) => number)) => number
  setFullscreen: (v: boolean | ((prev: boolean) => boolean)) => boolean
}) {
  const progress = createMemo(() => {
    const dur = props.duration()
    if (!dur) return 0
    const pos = props.seekRatio() != null ? props.seekRatio()! * dur : props.currentTime()
    return Math.max(0, Math.min(100, (pos / dur) * 100))
  })

  const displayTime = createMemo(() => {
    if (props.seekRatio() != null) return fmtTime(props.seekRatio()! * props.duration())
    return fmtTime(props.currentTime())
  })

  const bufferedPct = createMemo(() => {
    if (!props.duration()) return 0
    return Math.max(0, Math.min(100, (props.buffered() / props.duration()) * 100))
  })

  function onSeekDown(event: PointerEvent) {
    if (typeof event.button === 'number' && event.button !== 0) return
    const target = event.currentTarget as HTMLElement
    try { target.setPointerCapture(event.pointerId) } catch { console.warn('Failed to set pointer capture on seek bar') }
    const ratio = clamp01(ratioFromPointer(event, target))
    props.setSeekRatio(ratio)
    if (props.videoRef) props.videoRef.currentTime = ratio * (props.videoRef.duration || 0)
  }

  function onSeekMove(event: PointerEvent) {
    const r = props.seekRatio()
    if (r == null) return
    const target = event.currentTarget as HTMLElement
    const ratio = clamp01(ratioFromPointer(event, target))
    props.setSeekRatio(ratio)
    if (props.videoRef) props.videoRef.currentTime = ratio * (props.videoRef.duration || 0)
  }

  function onSeekUp(event: PointerEvent) {
    if (props.seekRatio() == null) return
    const target = event.currentTarget as HTMLElement
    try { target.releasePointerCapture(event.pointerId) } catch { console.warn('Failed to release pointer capture on seek bar') }
    props.setSeekRatio(null)
  }

  function onTouchSeekStart(event: TouchEvent) {
    if (!event.touches[0]) return
    event.preventDefault()
    const target = event.currentTarget as HTMLElement
    const ratio = clamp01(ratioFromTouch(event.touches[0], target))
    props.setSeekRatio(ratio)
    if (props.videoRef) props.videoRef.currentTime = ratio * (props.videoRef.duration || 0)
  }

  function onTouchSeekMove(event: TouchEvent) {
    if (props.seekRatio() == null || !event.touches[0]) return
    event.preventDefault()
    const target = event.currentTarget as HTMLElement
    const ratio = clamp01(ratioFromTouch(event.touches[0], target))
    props.setSeekRatio(ratio)
    if (props.videoRef) props.videoRef.currentTime = ratio * (props.videoRef.duration || 0)
  }

  function onTouchSeekEnd(event: TouchEvent) {
    if (props.seekRatio() == null) return
    event.preventDefault()
    props.setSeekRatio(null)
  }

  function onSeekKeyDown(event: KeyboardEvent) {
    const dur = props.duration()
    if (!dur) return
    let newTime = props.seekRatio() != null ? props.seekRatio()! * dur : props.currentTime()
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        event.preventDefault()
        newTime = Math.min(dur, newTime + SEEK_STEP)
        break
      case 'ArrowLeft':
      case 'ArrowDown':
        event.preventDefault()
        newTime = Math.max(0, newTime - SEEK_STEP)
        break
      case 'Home':
        event.preventDefault()
        newTime = 0
        break
      case 'End':
        event.preventDefault()
        newTime = dur
        break
      default:
        return
    }
    const ratio = dur > 0 ? newTime / dur : 0
    props.setSeekRatio(ratio)
    if (props.videoRef) props.videoRef.currentTime = newTime
  }

  function toggleMute() {
    if (!props.videoRef) return
    props.videoRef.muted = !props.videoRef.muted
    props.setMuted(props.videoRef.muted)
    try { localStorage.setItem('video-muted', String(props.videoRef.muted)) } catch {}
  }

  function onVolumeChange(e: Event) {
    if (!props.videoRef) return
    const v = parseFloat((e.target as HTMLInputElement).value)
    props.videoRef.volume = v
    props.setVolume(v)
    try { localStorage.setItem('video-volume', String(v)) } catch {}
    if (v > 0 && props.videoRef.muted) {
      props.videoRef.muted = false
      props.setMuted(false)
      try { localStorage.setItem('video-muted', 'false') } catch {}
    }
  }

  function toggleFullscreen() {
    if (!props.containerRef) return
    const doc = document as WebkitDocument
    const el = props.containerRef as WebkitElement
    if (isFullscreen(doc)) {
      exitFullscreen(doc)
      props.setFullscreen(false)
    } else {
      const canRequest = !!(el.requestFullscreen ?? el.webkitRequestFullscreen ?? el.webkitEnterFullscreen)
      if (canRequest) {
        requestFullscreen(el)
      } else if (!videoElementFullscreen(props.videoRef)) {
        return
      }
      props.setFullscreen(true)
    }
  }

  function selectQuality(index: number) {
    if (!props.hlsInstance) return
    props.hlsInstance.currentLevel = index
    props.setCurrentLevel(index)
    props.setQualityOpen(false)
  }

  return (
    <div class="custom-video-controls" class:is-visible={props.showControls() || !props.playing()}>
      <div
        class="custom-video-seek-bar"
        role="slider"
        tabIndex={0}
        aria-label="Video position"
        aria-valuemin={0}
        aria-valuemax={Math.max(props.duration(), 1)}
        aria-valuenow={props.seekRatio() != null ? props.seekRatio()! * props.duration() : props.currentTime()}
        aria-valuetext={displayTime()}
        onPointerDown={onSeekDown}
        onPointerMove={onSeekMove}
        onPointerUp={onSeekUp}
        onPointerCancel={onSeekUp}
        onTouchStart={onTouchSeekStart}
        onTouchMove={onTouchSeekMove}
        onTouchEnd={onTouchSeekEnd}
        onTouchCancel={onTouchSeekEnd}
        onKeyDown={onSeekKeyDown}
      >
        <div class="custom-video-buffer" style={{ width: `${bufferedPct()}%` }} />
        <div class="custom-video-fill" style={{ width: `${progress()}%` }} />
        <div class="custom-video-knob" style={{ left: `${progress()}%` }} />
      </div>
      <div class="custom-video-controls-row">
        <button type="button" class="custom-video-btn" onClick={() => props.onPlayPause()} aria-label={props.playing() ? 'Pause' : 'Play'}>
          <Show when={props.playing()} fallback={<Play size={16} aria-hidden="true" />}>
            <Pause size={16} aria-hidden="true" />
          </Show>
        </button>
        <span class="custom-video-time">{displayTime()} / {fmtTime(props.duration())}</span>
        <div class="custom-video-spacer" />
        <Show when={props.hlsLevels().length > 0}>
          <div class="custom-video-quality-wrapper">
            <button
              type="button"
              class="custom-video-btn custom-video-quality-btn"
              onClick={() => props.setQualityOpen((o) => !o)}
              aria-label="Quality"
            >
              <Settings size={14} aria-hidden="true" />
            </button>
            <Show when={props.qualityOpen()}>
              <div class="custom-video-quality-menu" role="menu" aria-label="Quality">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={props.currentLevel() === -1}
                  class={`custom-video-quality-option${props.currentLevel() === -1 ? ' is-active' : ''}`}
                  onClick={() => selectQuality(-1)}
                  onKeyDown={(e) => { if (e.key === 'Escape') props.setQualityOpen(false) }}
                >
                  Auto
                </button>
                <For each={props.hlsLevels()}>
                  {(level) => (
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={props.currentLevel() === level.index}
                      class={`custom-video-quality-option${props.currentLevel() === level.index ? ' is-active' : ''}`}
                      onClick={() => selectQuality(level.index)}
                      onKeyDown={(e) => { if (e.key === 'Escape') props.setQualityOpen(false) }}
                    >
                      {level.label}
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </Show>
        <Show when={props.volume() > 0 && !props.muted()}>
          <button type="button" class="custom-video-btn" onClick={toggleMute} aria-label="Mute">
            <Volume2 size={16} aria-hidden="true" />
          </button>
        </Show>
        <Show when={props.volume() === 0 || props.muted()}>
          <button type="button" class="custom-video-btn" onClick={toggleMute} aria-label="Unmute">
            <VolumeX size={16} aria-hidden="true" />
          </button>
        </Show>
        <input
          type="range"
          class="custom-video-volume"
          min="0" max="1" step="0.05"
          value={props.muted() ? 0 : props.volume()}
          aria-label="Volume"
          onInput={onVolumeChange}
        />
        <button type="button" class="custom-video-btn" onClick={toggleFullscreen} aria-label={props.fullscreen() ? 'Exit fullscreen' : 'Fullscreen'}>
          <Show when={props.fullscreen()} fallback={<Maximize size={16} aria-hidden="true" />}>
            <Minimize size={16} aria-hidden="true" />
          </Show>
        </button>
      </div>
    </div>
  )
}
