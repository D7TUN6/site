const ICON_VOLUME =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>'

const ICON_VOLUME_X =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>'

const ICON_MAXIMIZE =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3"></path><path d="M21 8V5a2 2 0 0 0-2-2h-3"></path><path d="M3 16v3a2 2 0 0 0 2 2h3"></path><path d="M16 21h3a2 2 0 0 0 2-2v-3"></path></svg>'

const ICON_MINIMIZE =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v3a2 2 0 0 1-2 2H3"></path><path d="M21 8h-3a2 2 0 0 1-2-2V3"></path><path d="M3 16h3a2 2 0 0 1 2 2v3"></path><path d="M16 21v-3a2 2 0 0 1 2-2h3"></path></svg>'

function make(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag)
  if (className) node.className = className
  return node
}

function makeButton(className: string): HTMLButtonElement {
  const node = document.createElement('button')
  node.type = 'button'
  if (className) node.className = className
  return node
}

function fmtTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
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

function setPlayPauseIcon(icon: HTMLSpanElement, playing: boolean): void {
  icon.className = playing ? 'release-player-icon-pause' : 'release-player-icon-play'
}

function makeListeners() {
  const listeners: Array<[EventTarget, string, EventListener]> = []
  const add = (target: EventTarget, type: string, fn: EventListener) => {
    target.addEventListener(type, fn)
    listeners.push([target, type, fn])
  }
  const dispose = () => {
    for (const [target, type, listener] of listeners) target.removeEventListener(type, listener)
    listeners.length = 0
  }
  return { add, dispose }
}

function enhanceAudio(audio: HTMLAudioElement): () => void {
  audio.removeAttribute('controls')
  audio.style.display = 'none'

  const { add, dispose } = makeListeners()

  const bar = make('div', 'blog-player-bar')
  const playBtn = makeButton('blog-player-btn')
  playBtn.type = 'button'
  playBtn.setAttribute('aria-label', 'Play/Pause')
  const pIcon = make('span', 'release-player-icon-play')
  playBtn.appendChild(pIcon)

  const seek = make('div', 'blog-player-seek')
  seek.setAttribute('role', 'slider')
  const fill = make('i', 'blog-player-fill')
  const knob = make('i', 'blog-player-knob')
  seek.append(fill, knob)

  const time = make('span', 'blog-player-time')
  time.textContent = '0:00 / -:--'

  const muteBtn = makeButton( 'blog-player-btn blog-player-btn-mute')
  muteBtn.type = 'button'
  muteBtn.setAttribute('aria-label', 'Mute')
  const renderMuteIcon = (muted: boolean) => { muteBtn.innerHTML = muted ? ICON_VOLUME_X : ICON_VOLUME }
  renderMuteIcon(audio.muted)

  bar.append(playBtn, seek, time, muteBtn)

  const updateSeek = () => {
    const dur = audio.duration || 0
    const pct = dur > 0 ? clamp01(audio.currentTime / dur) * 100 : 0
    fill.style.width = `${pct}%`
    knob.style.left = `${pct}%`
    time.textContent = `${fmtTime(audio.currentTime)} / ${dur > 0 ? fmtTime(dur) : '-:--'}`
  }
  const updateIcon = () => setPlayPauseIcon(pIcon, !audio.paused)
  const toggle = () => { if (audio.paused) { void audio.play().catch(() => {}) } else { audio.pause() } }

  let dragging = false
  const onSeekDown = (e: Event) => {
    const pe = e as PointerEvent
    if (typeof pe.button === 'number' && pe.button !== 0) return
    dragging = true
    seek.classList.add('is-dragging')
    try { seek.setPointerCapture(pe.pointerId) } catch { /* noop */ }
    audio.currentTime = clamp01(ratioFromPointer(pe, seek)) * (audio.duration || 0)
  }
  const onSeekMove = (e: Event) => {
    if (!dragging) return
    audio.currentTime = clamp01(ratioFromPointer(e as PointerEvent, seek)) * (audio.duration || 0)
  }
  const onSeekUp = () => {
    dragging = false
    seek.classList.remove('is-dragging')
  }

  add(playBtn, 'click', toggle)
  add(audio, 'play', updateIcon)
  add(audio, 'pause', updateIcon)
  add(audio, 'ended', () => { setPlayPauseIcon(pIcon, false); audio.currentTime = 0 })
  add(audio, 'timeupdate', updateSeek)
  add(audio, 'loadedmetadata', updateSeek)
  add(audio, 'durationchange', updateSeek)
  add(muteBtn, 'click', () => { audio.muted = !audio.muted; renderMuteIcon(audio.muted) })
  add(seek, 'pointerdown', onSeekDown)
  add(seek, 'pointermove', onSeekMove)
  add(seek, 'pointerup', onSeekUp)
  add(seek, 'pointercancel', onSeekUp)

  audio.after(bar)

  return () => {
    dispose()
    bar.remove()
  }
}

function enhanceVideo(video: HTMLVideoElement): () => void {
  video.removeAttribute('controls')

  const wrap = make('div', 'custom-video-player blog-video-player')
  video.classList.add('custom-video-player-video')
  video.parentNode!.insertBefore(wrap, video)
  wrap.appendChild(video)

  const { add, dispose } = makeListeners()

  const controls = make('div', 'custom-video-controls blog-video-controls')
  const seek = make('div', 'custom-video-seek-bar')
  seek.setAttribute('role', 'slider')
  const buf = make('i', 'custom-video-buffer')
  const fill = make('i', 'custom-video-fill')
  const knob = make('i', 'custom-video-knob')
  seek.append(buf, fill, knob)

  const row = make('div', 'custom-video-controls-row')
  const playBtn = makeButton( 'custom-video-btn')
  playBtn.type = 'button'
  playBtn.setAttribute('aria-label', 'Play/Pause')
  const pIcon = make('span', 'release-player-icon-play')
  playBtn.appendChild(pIcon)
  const time = make('span', 'custom-video-time')
  time.textContent = '0:00 / -:--'
  const spacer = make('div', 'custom-video-spacer')
  const muteBtn = makeButton( 'custom-video-btn')
  muteBtn.type = 'button'
  muteBtn.setAttribute('aria-label', 'Mute')
  const renderMuteIcon = (muted: boolean) => { muteBtn.innerHTML = muted ? ICON_VOLUME_X : ICON_VOLUME }
  renderMuteIcon(video.muted)
  const volume = document.createElement('input')
  volume.type = 'range'
  volume.className = 'custom-video-volume'
  volume.min = '0'
  volume.max = '1'
  volume.step = '0.05'
  volume.value = String(video.muted ? 0 : video.volume)
  volume.setAttribute('aria-label', 'Volume')
  const fsBtn = makeButton( 'custom-video-btn')
  fsBtn.type = 'button'
  fsBtn.setAttribute('aria-label', 'Fullscreen')
  fsBtn.innerHTML = ICON_MAXIMIZE

  row.append(playBtn, time, spacer, muteBtn, volume, fsBtn)
  controls.append(seek, row)
  wrap.appendChild(controls)

  const center = makeButton( 'blog-video-center')
  center.type = 'button'
  center.setAttribute('aria-label', 'Play')
  center.append(make('span', 'release-player-icon-play'))
  wrap.appendChild(center)

  const updateTime = () => {
    const dur = video.duration || 0
    const pct = dur > 0 ? clamp01(video.currentTime / dur) * 100 : 0
    fill.style.width = `${pct}%`
    knob.style.left = `${pct}%`
    let bufferedPct = 0
    if (dur > 0 && video.buffered.length > 0) {
      try { bufferedPct = clamp01(video.buffered.end(video.buffered.length - 1) / dur) * 100 } catch { /* noop */ }
    }
    buf.style.width = `${bufferedPct}%`
    time.textContent = `${fmtTime(video.currentTime)} / ${dur > 0 ? fmtTime(dur) : '-:--'}`
  }
  const updatePlayIcon = () => setPlayPauseIcon(pIcon, !video.paused)
  const toggle = () => { if (video.paused) { void video.play().catch(() => {}) } else { video.pause() } }

  let hideTimer: number | undefined
  const showControls = () => {
    controls.classList.add('is-visible')
    if (hideTimer !== undefined) window.clearTimeout(hideTimer)
    hideTimer = window.setTimeout(() => { if (!video.paused) controls.classList.remove('is-visible') }, 2600)
  }
  const hideControls = () => controls.classList.remove('is-visible')

  let dragging = false
  const onSeekDown = (e: Event) => {
    const pe = e as PointerEvent
    if (typeof pe.button === 'number' && pe.button !== 0) return
    dragging = true
    try { seek.setPointerCapture(pe.pointerId) } catch { /* noop */ }
    video.currentTime = clamp01(ratioFromPointer(pe, seek)) * (video.duration || 0)
  }
  const onSeekMove = (e: Event) => {
    if (!dragging) return
    video.currentTime = clamp01(ratioFromPointer(e as PointerEvent, seek)) * (video.duration || 0)
  }
  const onSeekUp = () => { dragging = false }

  const updateFsIcon = () => {
    fsBtn.innerHTML = document.fullscreenElement === wrap ? ICON_MINIMIZE : ICON_MAXIMIZE
  }

  add(playBtn, 'click', toggle)
  add(video, 'click', toggle)
  add(center, 'click', toggle)
  add(video, 'play', () => {
    updatePlayIcon()
    wrap.classList.remove('is-paused')
    if (hideTimer !== undefined) window.clearTimeout(hideTimer)
    hideTimer = window.setTimeout(hideControls, 2600)
  })
  add(video, 'pause', () => {
    updatePlayIcon()
    wrap.classList.add('is-paused')
    controls.classList.add('is-visible')
  })
  add(video, 'ended', () => { setPlayPauseIcon(pIcon, false); wrap.classList.add('is-paused'); controls.classList.add('is-visible') })
  add(video, 'timeupdate', updateTime)
  add(video, 'loadedmetadata', updateTime)
  add(video, 'progress', updateTime)
  add(muteBtn, 'click', () => {
    video.muted = !video.muted
    renderMuteIcon(video.muted)
    volume.value = video.muted ? '0' : String(video.volume || 1)
  })
  add(volume, 'input', () => {
    const v = parseFloat(volume.value)
    video.volume = v
    video.muted = v <= 0
    renderMuteIcon(video.muted)
  })
  add(fsBtn, 'click', () => {
    if (document.fullscreenElement === wrap) { void document.exitFullscreen() } else { void wrap.requestFullscreen?.().catch(() => {}) }
  })
  add(document, 'fullscreenchange', updateFsIcon)
  add(wrap, 'pointerenter', showControls)
  add(wrap, 'pointermove', showControls)
  add(wrap, 'pointerleave', hideControls)
  add(wrap, 'focus', showControls)
  add(seek, 'pointerdown', onSeekDown)
  add(seek, 'pointermove', onSeekMove)
  add(seek, 'pointerup', onSeekUp)
  add(seek, 'pointercancel', onSeekUp)

  return () => {
    if (hideTimer !== undefined) window.clearTimeout(hideTimer)
    dispose()
    wrap.replaceWith(video)
  }
}

export function enhanceBlogMedia(root: HTMLElement): () => void {
  const cleanups: Array<() => void> = []
  root.querySelectorAll('audio.blog-media').forEach((el) => {
    try { cleanups.push(enhanceAudio(el as HTMLAudioElement)) } catch (err) { console.warn('blog audio enhance failed', err) }
  })
  root.querySelectorAll('video.blog-media').forEach((el) => {
    try { cleanups.push(enhanceVideo(el as HTMLVideoElement)) } catch (err) { console.warn('blog video enhance failed', err) }
  })
  return () => { cleanups.forEach((cleanup) => cleanup()) }
}