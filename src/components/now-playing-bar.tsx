import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js'
import {
  ListMusic, Pause, Play, Repeat, Repeat1, Shuffle,
  SkipBack, SkipForward, Volume2, VolumeX, X,
} from 'lucide-solid'
import { usePlayer } from '@/features/player/usePlayer'

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function fmtTime(seconds: number | null): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function ratioFromPointer(event: PointerEvent, target: HTMLElement): number {
  const rect = target.getBoundingClientRect()
  if (rect.width <= 0) return 0
  return (event.clientX - rect.left) / rect.width
}

export function NowPlayingBar(props: { isMusicRoute: boolean; lang?: string }) {
  const player = usePlayer()
  const [nextUpOpen, setNextUpOpen] = createSignal(false)
  const [fullscreenOpen, setFullscreenOpen] = createSignal(false)
  const [volumeOpen, setVolumeOpen] = createSignal(false)
  const [seekDragRatio, setSeekDragRatio] = createSignal<number | null>(null)
  let panelRef: HTMLDivElement | undefined
  let nextUpButtonRef: HTMLButtonElement | undefined
  let volumeBoxRef: HTMLDivElement | undefined
  let volumeCloseTimer: number | null = null

  const shouldShow = createMemo(() => Boolean(player.state.queue && player.currentTrack() && (props.isMusicRoute || player.state.hasStartedPlayback)))
  const progress = createMemo(() => {
    if (player.state.duration <= 0) return 0
    return Math.max(0, Math.min(100, (player.state.currentTime / player.state.duration) * 100))
  })
  const buffered = createMemo(() => {
    if (player.state.duration <= 0) return 0
    const value = (player.state.bufferedTime / player.state.duration) * 100
    return Math.max(0, Math.min(100, value))
  })
  const displayProgress = createMemo(() => {
    const drag = seekDragRatio()
    if (drag == null) return progress()
    return Math.max(0, Math.min(100, drag * 100))
  })
  const displayCurrentTime = createMemo(() => {
    const drag = seekDragRatio()
    if (drag == null) return fmtTime(player.state.currentTime)
    return fmtTime(player.state.duration * drag)
  })
  const currentQueueTracks = createMemo(() => player.state.queue?.tracks ?? [])
  const repeatLabel = createMemo(() => {
    if (player.state.repeatMode === 'one') return 'Repeat One'
    if (player.state.repeatMode === 'all') return 'Repeat All'
    return 'Repeat Off'
  })

  function clearVolumeCloseTimer() {
    if (volumeCloseTimer === null) return
    window.clearTimeout(volumeCloseTimer)
    volumeCloseTimer = null
  }

  function openVolumePopup() {
    clearVolumeCloseTimer()
    setVolumeOpen(true)
  }

  function scheduleVolumePopupClose() {
    clearVolumeCloseTimer()
    volumeCloseTimer = window.setTimeout(() => {
      setVolumeOpen(false)
      volumeCloseTimer = null
    }, 180)
  }

  function onVolumeFocusOut(event: FocusEvent) {
    const nextTarget = event.relatedTarget as Node | null
    if (nextTarget && volumeBoxRef?.contains(nextTarget)) return
    scheduleVolumePopupClose()
  }

  function onSeekPointerDown(event: PointerEvent) {
    if (player.state.duration <= 0) return
    if (typeof event.button === 'number' && event.button !== 0) return
    const target = event.currentTarget as HTMLElement
    try { target.setPointerCapture(event.pointerId) } catch { }
    const ratio = clamp01(ratioFromPointer(event, target))
    setSeekDragRatio(ratio)
    player.seekByRatio(ratio)
  }

  function onSeekPointerMove(event: PointerEvent) {
    const current = seekDragRatio()
    if (current == null) return
    const target = event.currentTarget as HTMLElement
    const ratio = clamp01(ratioFromPointer(event, target))
    setSeekDragRatio(ratio)
    player.seekByRatio(ratio)
  }

  function onSeekPointerUp(event: PointerEvent) {
    const current = seekDragRatio()
    if (current == null) return
    const target = event.currentTarget as HTMLElement
    try { target.releasePointerCapture(event.pointerId) } catch { }
    setSeekDragRatio(null)
  }

  function onPointerDown(event: PointerEvent) {
    if (!nextUpOpen()) return
    const node = event.target as Node | null
    if (!node) return
    if (panelRef?.contains(node)) return
    if (nextUpButtonRef?.contains(node)) return
    setNextUpOpen(false)
  }

  function onBarClick(event: MouseEvent) {
    const target = event.target as HTMLElement | null
    if (!target) return
    if (target.closest('[data-no-fullscreen]')) return
    setFullscreenOpen(true)
  }

  createEffect(() => {
    document.body.classList.toggle('has-now-playing-bar', shouldShow())
    if (!shouldShow()) {
      setFullscreenOpen(false); setNextUpOpen(false); setVolumeOpen(false); clearVolumeCloseTimer()
    }
  })

  createEffect(() => { document.body.classList.toggle('has-now-playing-fullscreen', fullscreenOpen()) })

  onMount(() => { window.addEventListener('pointerdown', onPointerDown) })
  onCleanup(() => {
    document.body.classList.remove('has-now-playing-bar')
    document.body.classList.remove('has-now-playing-fullscreen')
    window.removeEventListener('pointerdown', onPointerDown)
    clearVolumeCloseTimer()
  })

  return (
    <Show when={shouldShow() && player.state.queue && player.currentTrack()}>
      <Show when={nextUpOpen()}>
        <div ref={panelRef} class="now-playing-nextup" role="dialog" aria-label="Next up">
          <div class="now-playing-nextup-head">
            <h4>Next up</h4>
            <button type="button" onClick={() => setNextUpOpen(false)} aria-label="Close next up">
              <X class="now-playing-icon" />
            </button>
          </div>
          <Show when={player.upcomingTracks().length > 0} fallback={<p class="now-playing-nextup-empty">Queue is empty.</p>}>
            <ul>
              <For each={player.upcomingTracks()}>
                {(item) => (
                  <li>
                    <button type="button" onClick={() => player.playTrack(item.index)}>
                      <div class="progressive-cover" style={{ 'background-image': `url(${player.state.queue!.coverUrl})`, width: '36px', height: '36px', 'border-radius': '2px', 'flex-shrink': '0' }}>
                        <img src={player.state.queue!.coverUrl} alt="" width="36" height="36" onLoad={(e) => e.currentTarget.classList.add('loaded')} />
                      </div>
                      <div>
                        <span>{player.state.queue!.artist}</span>
                        <strong>{item.track.title}</strong>
                      </div>
                      <time>{fmtTime(item.duration)}</time>
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>
      </Show>

      <Show when={fullscreenOpen()}>
        <div class="now-playing-fullscreen" role="dialog" aria-modal="true" aria-label="Now playing fullscreen">
          <button type="button" class="now-playing-fullscreen-close" aria-label="Close fullscreen player" onClick={() => setFullscreenOpen(false)}>
            <X class="now-playing-icon" />
          </button>
          <div class="now-playing-fullscreen-shell">
            <section class="now-playing-fullscreen-hero">
              <div class="now-playing-fullscreen-art-card">
                <div class="now-playing-fullscreen-art">
                  <div class="progressive-cover" style={{ 'background-image': `url(${player.state.queue!.coverUrl})` }}>
                    <img src={player.state.queue!.coverUrl} alt={`${player.state.queue!.albumTitle} cover`} width="320" height="320" onLoad={(e) => e.currentTarget.classList.add('loaded')} />
                  </div>
                </div>
                <div class="now-playing-fullscreen-meta">
                  <div class="now-playing-fullscreen-artist">{player.state.queue!.artist}</div>
                  <h2>{player.currentTrack()!.title}</h2>
                  <p>{player.state.queue!.albumTitle}</p>
                </div>
              </div>
            </section>
            <section class="now-playing-fullscreen-panel">
              <div class="now-playing-fullscreen-toolbar">
                <div class="now-playing-fullscreen-modes">
                  <button type="button" class={`now-playing-btn now-playing-btn-small${player.state.shuffleEnabled ? ' is-active' : ''}`} aria-label="Shuffle" onClick={player.toggleShuffle}>
                    <Shuffle class="now-playing-icon" />
                  </button>
                  <button type="button" class={`now-playing-btn now-playing-btn-small${player.state.repeatMode !== 'off' ? ' is-active' : ''}`} aria-label={repeatLabel()} onClick={player.cycleRepeatMode}>
                    <Show when={player.state.repeatMode === 'one'} fallback={<Repeat class="now-playing-icon" />}>
                      <Repeat1 class="now-playing-icon" />
                    </Show>
                  </button>
                </div>
              </div>
              <div class="now-playing-fullscreen-playback">
                <div class="now-playing-fullscreen-progress">
                  <div class="now-playing-time">{displayCurrentTime()}</div>
                  <div
                    class={`now-playing-progress${seekDragRatio() !== null ? ' is-dragging' : ''}`}
                    role="slider"
                    aria-valuemin={0}
                    aria-valuemax={Math.max(player.state.duration, 1)}
                    aria-valuenow={seekDragRatio() == null ? player.state.currentTime : player.state.duration * seekDragRatio()!}
                    aria-label="Playback position"
                    onPointerDown={onSeekPointerDown}
                    onPointerMove={onSeekPointerMove}
                    onPointerUp={onSeekPointerUp}
                    onPointerCancel={onSeekPointerUp}
                  >
                    <span class="now-playing-progress-buffer" style={{ width: `${buffered()}%` }} />
                    <span class="now-playing-progress-fill" style={{ width: `${displayProgress()}%` }} />
                    <span class="now-playing-progress-knob" style={{ left: `${displayProgress()}%` }} />
                  </div>
                  <div class="now-playing-time">{fmtTime(player.state.duration)}</div>
                </div>
                <div class="now-playing-fullscreen-controls">
                  <button type="button" class="now-playing-btn" aria-label="Previous track" onClick={player.prevTrack}><SkipBack class="now-playing-icon" /></button>
                  <button type="button" class="now-playing-btn now-playing-btn-main" aria-label={player.state.playing ? 'Pause' : 'Play'} onClick={player.togglePlayPause}>
                    <Show when={player.state.playing} fallback={<Play class="now-playing-icon now-playing-icon-play" />}>
                      <Pause class="now-playing-icon now-playing-icon-pause" />
                    </Show>
                  </button>
                  <button type="button" class="now-playing-btn" aria-label="Next track" onClick={player.nextTrack}><SkipForward class="now-playing-icon" /></button>
                </div>
              </div>
              <div class="now-playing-fullscreen-tracklist">
                <div class="now-playing-fullscreen-tracklist-head">Tracklist</div>
                <ul>
                  <For each={currentQueueTracks()}>
                    {(track, index) => (
                      <li class={index() === player.state.currentIndex ? 'is-active' : ''}>
                        <button type="button" onClick={() => player.playTrack(index())}>
                          <span class="now-playing-fullscreen-track-index">{index() + 1}</span>
                          <span class="now-playing-fullscreen-track-title">{track.title}</span>
                          <span class="now-playing-fullscreen-track-time">{fmtTime(track.duration ?? null)}</span>
                        </button>
                      </li>
                    )}
                  </For>
                </ul>
              </div>
            </section>
          </div>
        </div>
      </Show>

      <div class="now-playing-bar" role="region" aria-label="Now playing" onClick={onBarClick}>
        <div class="now-playing-bar-inner">
          <div class="now-playing-controls" data-no-fullscreen>
            <button type="button" class="now-playing-btn" aria-label="Previous track" onClick={(e) => { e.stopPropagation(); player.prevTrack() }}><SkipBack class="now-playing-icon" /></button>
            <button type="button" class="now-playing-btn now-playing-btn-main" aria-label={player.state.playing ? 'Pause' : 'Play'} onClick={(e) => { e.stopPropagation(); player.togglePlayPause() }}>
              <Show when={player.state.playing} fallback={<Play class="now-playing-icon now-playing-icon-play" />}>
                <Pause class="now-playing-icon now-playing-icon-pause" />
              </Show>
            </button>
            <button type="button" class="now-playing-btn" aria-label="Next track" onClick={(e) => { e.stopPropagation(); player.nextTrack() }}><SkipForward class="now-playing-icon" /></button>
            <button type="button" class={`now-playing-btn now-playing-btn-small${player.state.shuffleEnabled ? ' is-active' : ''}`} aria-label="Shuffle" onClick={(e) => { e.stopPropagation(); player.toggleShuffle() }}><Shuffle class="now-playing-icon" /></button>
            <button type="button" class={`now-playing-btn now-playing-btn-small${player.state.repeatMode !== 'off' ? ' is-active' : ''}`} aria-label="Repeat" onClick={(e) => { e.stopPropagation(); player.cycleRepeatMode() }}>
              <Show when={player.state.repeatMode === 'one'} fallback={<Repeat class="now-playing-icon" />}>
                <Repeat1 class="now-playing-icon" />
              </Show>
            </button>
          </div>
          <div class="now-playing-info">
            <div class="progressive-cover now-playing-cover" style={{ 'background-image': `url(${player.state.queue!.coverUrl})` }}>
              <img src={player.state.queue!.coverUrl} alt="" width="28" height="28" onLoad={(e) => e.currentTarget.classList.add('loaded')} />
            </div>
            <div class="now-playing-meta">
              <div class="now-playing-title">{player.currentTrack()!.title}</div>
              <div class="now-playing-artist">{player.state.queue!.artist}</div>
            </div>
          </div>
          <div class="now-playing-seek" data-no-fullscreen onClick={(e) => e.stopPropagation()}>
            <div class="now-playing-seek-bar"
              role="slider"
              aria-valuemin={0}
              aria-valuemax={Math.max(player.state.duration, 1)}
              aria-valuenow={seekDragRatio() == null ? player.state.currentTime : player.state.duration * seekDragRatio()!}
              aria-label="Playback position"
              onPointerDown={onSeekPointerDown}
              onPointerMove={onSeekPointerMove}
              onPointerUp={onSeekPointerUp}
              onPointerCancel={onSeekPointerUp}
            >
              <span class="now-playing-progress-buffer" style={{ width: `${buffered()}%` }} />
              <span class="now-playing-progress-fill" style={{ width: `${displayProgress()}%` }} />
              <span class="now-playing-progress-knob" style={{ left: `${displayProgress()}%` }} />
            </div>
            <div class="now-playing-seek-time">{displayCurrentTime()}</div>
          </div>
          <div class="now-playing-actions" data-no-fullscreen>
            <div
              ref={volumeBoxRef}
              class={`now-playing-volume-box${volumeOpen() ? ' is-open' : ''}`}
              onClick={(e) => e.stopPropagation()}
              onMouseEnter={openVolumePopup}
              onMouseLeave={scheduleVolumePopupClose}
              onFocusIn={openVolumePopup}
              onFocusOut={onVolumeFocusOut}
            >
              <button type="button" class={`now-playing-btn now-playing-btn-small${player.state.muted || player.state.volume <= 0 ? ' is-muted' : ''}`} aria-label={player.state.muted || player.state.volume <= 0 ? 'Unmute' : 'Mute'} onClick={(e) => { e.stopPropagation(); player.toggleMute() }}>
                <Show when={player.state.muted || player.state.volume <= 0} fallback={<Volume2 class="now-playing-icon" />}>
                  <VolumeX class="now-playing-icon" />
                </Show>
              </button>
              <div class="now-playing-volume-popup">
                <input class="now-playing-volume-slider" type="range" min="0" max="1" step="0.01" value={player.state.muted ? 0 : player.state.volume} aria-label="Volume" onInput={(e) => player.setVolume(Number(e.currentTarget.value))} />
              </div>
            </div>
            <button ref={nextUpButtonRef} type="button" class={`now-playing-btn now-playing-btn-small${nextUpOpen() ? ' is-active' : ''}`} aria-label="Next up" onClick={(e) => { e.stopPropagation(); setNextUpOpen(!nextUpOpen()) }}>
              <ListMusic class="now-playing-icon" />
            </button>
            <button type="button" class="now-playing-btn now-playing-btn-small" aria-label="Close player" onClick={(e) => { e.stopPropagation(); player.clearPlayer() }}>
              <X class="now-playing-icon" />
            </button>
          </div>
        </div>
      </div>
    </Show>
  )
}
