import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js'
import { Portal } from 'solid-js/web'
import {
  ListMusic, Pause, Play, Repeat, Repeat1, Settings, Shuffle,
  SkipBack, SkipForward, Volume2, VolumeX, X,
} from 'lucide-solid'
import { usePlayer } from '@/features/player/usePlayer'
import { cssUrl } from '@/lib/media'
import { AudioSettingsPanel } from '@/components/audio-settings-panel'
import { PlayheadShip } from '@/components/player/playhead-ship'

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
  const [audioSettingsOpen, setAudioSettingsOpen] = createSignal(false)
  const [seekDragRatio, setSeekDragRatio] = createSignal<number | null>(null)
  const [coverLightboxOpen, setCoverLightboxOpen] = createSignal(false)
  let panelRef: HTMLDivElement | undefined
  let nextUpButtonRef: HTMLButtonElement | undefined
  let volumeBoxRef: HTMLDivElement | undefined
  let volumeCloseTimer: number | null = null

  const shouldShow = createMemo(() => (Boolean(player.state.queue && player.currentTrack() && (props.isMusicRoute || player.state.hasStartedPlayback)) || (player.state.radioActive && player.state.hasStartedPlayback)))
  const isRadio = () => player.state.radioActive
  const coverUrl = () => (player.state.radioActive ? (player.state.radioTrack?.coverUrl ?? '') : player.state.queue!.coverUrl)
  const trackTitle = () => (player.state.radioActive ? (player.state.radioTrack?.title ?? '—') : player.currentTrack()!.title)
  const artistLabel = () => {
    if (player.state.radioActive) {
      const artist = player.state.radioTrack?.artist
      return artist ? `${artist} · radio` : 'D7TUN6 · radio'
    }
    return player.state.queue!.artist
  }
  const albumLabel = () => player.state.radioActive ? (player.state.radioTrack?.album || 'live broadcast') : player.state.queue!.albumTitle
  const radioElapsed = () => player.state.radioTrack?.elapsed ?? 0
  const radioDuration = () => player.state.radioTrack?.duration ?? 0
  const radioProgressPct = () => {
    const d = radioDuration()
    if (d <= 0) return 0
    return Math.max(0, Math.min(100, (radioElapsed() / d) * 100))
  }
  const radioElapsedReadout = () => isRadio() ? fmtTime(radioElapsed()) : displayCurrentTime()
  const radioDurationReadout = () => isRadio() ? fmtTime(radioDuration()) : fmtTime(player.state.duration)
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
    <Show when={shouldShow()}>
      <Show when={nextUpOpen()}>
        <div ref={panelRef} class="now-playing-nextup" role="dialog" aria-label="Next up">
          <div class="now-playing-nextup-head">
            <h4>Next up</h4>
            <button type="button" onClick={() => setNextUpOpen(false)} aria-label="Close next up">
              <X class="now-playing-icon" />
            </button>
          </div>
          <Show when={isRadio()}>
            <Show
              when={(player.state.radioTrack?.upcoming?.length ?? 0) > 0}
              fallback={<p class="now-playing-nextup-empty">Upcoming tracks will appear here.</p>}
            >
              <ul>
                <For each={player.state.radioTrack?.upcoming ?? []}>
                  {(item) => (
                    <li>
                      <button type="button" disabled>
                        <div class="progressive-cover" style={{ 'background-image': cssUrl(item.coverUrl), width: '22px', height: '22px', 'flex-shrink': '0' }}>
                          <img src={item.coverUrl} alt="" width="36" height="36" onLoad={(e) => e.currentTarget.classList.add('loaded')} />
                        </div>
                        <div>
                          <span>{item.artist || 'D7TUN6'}</span>
                          <strong>{item.title}</strong>
                        </div>
                        <time>{fmtTime(item.duration)}</time>
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </Show>
          <Show when={!isRadio()}>
            <Show when={player.upcomingTracks().length > 0} fallback={<p class="now-playing-nextup-empty">Queue is empty.</p>}>
              <ul>
                <For each={player.upcomingTracks()}>
                  {(item) => (
                    <li>
                      <button type="button" onClick={() => player.playTrack(item.index)}>
                        <div class="progressive-cover" style={{ 'background-image': cssUrl(player.state.queue!.coverUrl), width: '29px', height: '29px', 'flex-shrink': '0' }}>
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
          </Show>
        </div>
      </Show>

      <Show when={fullscreenOpen()}>
        <div class="now-playing-fullscreen" role="dialog" aria-modal="true" aria-label="Now playing fullscreen" onClick={(event) => { if (event.target === event.currentTarget) setFullscreenOpen(false) }}>
          <button type="button" class="overlay-close" aria-label="Close fullscreen player" onClick={() => setFullscreenOpen(false)}>
            <X />
          </button>
          <div class="now-playing-fullscreen-shell">
            <section class="now-playing-fullscreen-hero">
<div class="now-playing-fullscreen-art-card">
                <Show when={coverUrl()} fallback={<div class="now-playing-fullscreen-art now-playing-fullscreen-art-fallback" />}>
                  <div class="now-playing-fullscreen-art" style={{ cursor: 'pointer' }} onClick={() => coverUrl() && setCoverLightboxOpen(true)}>
                    <img
                      src={coverUrl()}
                      alt={`${trackTitle()} cover`}
                      width="320"
                      height="320"
                      onLoad={(e) => e.currentTarget.classList.add('loaded')}
                    />
                  </div>
                </Show>
                <div class="now-playing-fullscreen-meta">
                  <div class="now-playing-fullscreen-artist">{artistLabel()}</div>
                  <h2>{trackTitle()}</h2>
                  <p>{albumLabel()}</p>
                </div>
              </div>
            </section>
            <section class="now-playing-fullscreen-panel">
              <div class="now-playing-fullscreen-toolbar">
                <div class="now-playing-fullscreen-modes">
                  <button type="button" class={`now-playing-btn now-playing-btn-small${player.state.shuffleEnabled ? ' is-active' : ''}`} aria-label="Shuffle" disabled={isRadio()} onClick={player.toggleShuffle}>
                    <Shuffle class="now-playing-icon" />
                  </button>
                  <button type="button" class={`now-playing-btn now-playing-btn-small${player.state.repeatMode !== 'off' ? ' is-active' : ''}`} aria-label={repeatLabel()} disabled={isRadio()} onClick={player.cycleRepeatMode}>
                    <Show when={player.state.repeatMode === 'one'} fallback={<Repeat class="now-playing-icon" />}>
                      <Repeat1 class="now-playing-icon" />
                    </Show>
                  </button>
                </div>
              </div>
              <div class="now-playing-fullscreen-playback">
                <div class="now-playing-fullscreen-progress">
                  <div class="now-playing-time">{radioElapsedReadout()}</div>
                  <div
                    class={`now-playing-progress${seekDragRatio() !== null ? ' is-dragging' : ''}${isRadio() ? ' is-static' : ''}`}
                    role={isRadio() ? 'progressbar' : 'slider'}
                    aria-valuemin={0}
                    aria-valuemax={isRadio() ? Math.max(radioDuration(), 1) : Math.max(player.state.duration, 1)}
                    aria-valuenow={isRadio() ? radioElapsed() : seekDragRatio() == null ? player.state.currentTime : player.state.duration * seekDragRatio()!}
                    aria-label="Playback position"
                    onPointerDown={isRadio() ? undefined : onSeekPointerDown}
                    onPointerMove={isRadio() ? undefined : onSeekPointerMove}
                    onPointerUp={isRadio() ? undefined : onSeekPointerUp}
                    onPointerCancel={isRadio() ? undefined : onSeekPointerUp}
                  >
                    <Show when={!isRadio()}><span class="now-playing-progress-buffer" style={{ width: `${buffered()}%` }} /></Show>
                    <span class="now-playing-progress-fill" style={{ width: isRadio() ? `${radioProgressPct()}%` : `${displayProgress()}%` }} />
                    <Show when={!isRadio()}><span class="now-playing-progress-knob" style={{ left: `${displayProgress()}%` }} /></Show>
                  </div>
                  <div class="now-playing-time">{radioDurationReadout()}</div>
                </div>
                <div class="now-playing-fullscreen-controls">
                  <button type="button" class="now-playing-btn" aria-label="Previous track" disabled={isRadio()} onClick={player.prevTrack}><SkipBack class="now-playing-icon" /></button>
                  <button type="button" class="now-playing-btn now-playing-btn-main" aria-label={player.state.playing ? 'Pause' : 'Play'} onClick={player.togglePlayPause}>
                    <Show when={player.state.playing} fallback={<Play class="now-playing-icon now-playing-icon-play" />}>
                      <Pause class="now-playing-icon now-playing-icon-pause" />
                    </Show>
                  </button>
                  <button type="button" class="now-playing-btn" aria-label="Next track" disabled={isRadio()} onClick={player.nextTrack}><SkipForward class="now-playing-icon" /></button>
                </div>
              </div>
              <Show when={isRadio()} fallback={
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
              }>
              <div class="now-playing-fullscreen-tracklist">
                <div class="now-playing-fullscreen-tracklist-head">Upcoming</div>
                <Show
                  when={(player.state.radioTrack?.upcoming?.length ?? 0) > 0}
                  fallback={<p class="now-playing-nextup-empty">Upcoming tracks will appear here.</p>}
                >
                  <ul>
                    <For each={player.state.radioTrack?.upcoming ?? []}>
                      {(item, index) => (
                        <li>
                          <button type="button" disabled>
                            <span class="now-playing-fullscreen-track-index">{index() + 1}</span>
                            <span class="now-playing-fullscreen-track-title">{item.title}</span>
                            <span class="now-playing-fullscreen-track-time">{fmtTime(item.duration)}</span>
                          </button>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </div>
              </Show>
            </section>
          </div>
        </div>
      </Show>

      <div class="now-playing-bar" role="region" aria-label="Now playing" onClick={onBarClick}>
        <div class="now-playing-bar-inner">
          <div class="now-playing-controls" data-no-fullscreen>
            <button type="button" class="now-playing-btn" aria-label="Previous track" disabled={isRadio()} onClick={(e) => { e.stopPropagation(); player.prevTrack() }}><SkipBack class="now-playing-icon" /></button>
            <button type="button" class="now-playing-btn now-playing-btn-main" aria-label={player.state.playing ? 'Pause' : 'Play'} onClick={(e) => { e.stopPropagation(); player.togglePlayPause() }}>
              <Show when={player.state.playing} fallback={<Play class="now-playing-icon now-playing-icon-play" />}>
                <Pause class="now-playing-icon now-playing-icon-pause" />
              </Show>
            </button>
            <button type="button" class="now-playing-btn" aria-label="Next track" disabled={isRadio()} onClick={(e) => { e.stopPropagation(); player.nextTrack() }}><SkipForward class="now-playing-icon" /></button>
            <button type="button" class={`now-playing-btn now-playing-btn-small${player.state.shuffleEnabled ? ' is-active' : ''}`} aria-label="Shuffle" disabled={isRadio()} onClick={(e) => { e.stopPropagation(); player.toggleShuffle() }}><Shuffle class="now-playing-icon" /></button>
            <button type="button" class={`now-playing-btn now-playing-btn-small${player.state.repeatMode !== 'off' ? ' is-active' : ''}`} aria-label="Repeat" disabled={isRadio()} onClick={(e) => { e.stopPropagation(); player.cycleRepeatMode() }}>
              <Show when={player.state.repeatMode === 'one'} fallback={<Repeat class="now-playing-icon" />}>
                <Repeat1 class="now-playing-icon" />
              </Show>
            </button>
          </div>
          <div class="now-playing-info">
            <div class="progressive-cover now-playing-cover" style={{ 'background-image': cssUrl(coverUrl()), cursor: coverUrl() ? 'pointer' : undefined }} data-no-fullscreen onClick={(e) => { e.stopPropagation(); if (coverUrl()) setCoverLightboxOpen(true) }}>
              <Show when={coverUrl()} fallback={<span class="now-playing-cover-fallback" />}>
                <img src={coverUrl()} alt="" width="28" height="28" onLoad={(e) => e.currentTarget.classList.add('loaded')} />
              </Show>
            </div>
            <div class="now-playing-meta">
              <div class="now-playing-title">{trackTitle()}</div>
              <div class="now-playing-artist">{artistLabel()}</div>
            </div>
          </div>
          <div class="now-playing-seek" data-no-fullscreen onClick={(e) => e.stopPropagation()}>
            <Show when={isRadio()} fallback={
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
                <PlayheadShip progress={displayProgress} active={() => player.state.playing} />
              </div>
            }>
              <div class="now-playing-seek-bar is-static" role="progressbar" aria-valuemin={0} aria-valuemax={Math.max(radioDuration(), 1)} aria-valuenow={radioElapsed()} aria-label="Radio position">
                <span class="now-playing-progress-fill" style={{ width: `${radioProgressPct()}%` }} />
                <PlayheadShip progress={radioProgressPct} active={() => player.state.playing} />
              </div>
            </Show>
            <div class="now-playing-seek-time">
              <Show when={isRadio()} fallback={displayCurrentTime()}>{`${fmtTime(radioElapsed())} · ${fmtTime(radioDuration())}`}</Show>
            </div>
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
            <button type="button" class={`now-playing-btn now-playing-btn-small${audioSettingsOpen() ? ' is-active' : ''}`} aria-label="Audio settings" onClick={(e) => { e.stopPropagation(); setAudioSettingsOpen(!audioSettingsOpen()) }}>
              <Settings class="now-playing-icon" />
            </button>
            <button ref={nextUpButtonRef} type="button" class={`now-playing-btn now-playing-btn-small${nextUpOpen() ? ' is-active' : ''}`} aria-label="Next up" onClick={(e) => { e.stopPropagation(); setNextUpOpen(!nextUpOpen()) }}>
              <ListMusic class="now-playing-icon" />
            </button>
            <button type="button" class="now-playing-btn now-playing-btn-small" aria-label="Close player" onClick={(e) => { e.stopPropagation(); player.clearPlayer() }}>
              <X class="now-playing-icon" />
            </button>
          </div>
        </div>
      </div>
      <Show when={audioSettingsOpen()}>
        <AudioSettingsPanel onClose={() => setAudioSettingsOpen(false)} />
      </Show>
      <Show when={coverLightboxOpen()}>
        <Portal>
          <div
            class="shop-lightbox"
            ref={(el) => { el?.focus() }}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            aria-label="Cover preview"
            onClick={(e) => { if (e.currentTarget === e.target) setCoverLightboxOpen(false) }}
            onKeyDown={(e) => { if (e.key === 'Escape') setCoverLightboxOpen(false) }}
          >
            <button type="button" class="overlay-close" aria-label="Close cover preview" onClick={() => setCoverLightboxOpen(false)}>
              <X />
            </button>
            <img class="shop-lightbox-img" src={coverUrl()} alt={`${trackTitle()} cover`} onLoad={(e) => e.currentTarget.classList.add('loaded')} />
          </div>
        </Portal>
      </Show>
    </Show>
  )
}
