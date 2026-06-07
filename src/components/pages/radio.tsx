import { For, Show, createResource, createSignal, onCleanup } from 'solid-js'
import { getRadioState, getRadioTracks, getNowPlaying, reportListener, getBroadcastPosition } from '@/lib/api/radio'
import type { Lang, NowPlayingInfo } from '@/types/content'
import Hls from 'hls.js/light'

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function RadioPage(props: {
  lang: Lang
}) {
  const [state] = createResource(getRadioState)
  const [tracks] = createResource(getRadioTracks)
  const [isPlaying, setIsPlaying] = createSignal(false)
  const [nowPlaying, setNowPlaying] = createSignal<NowPlayingInfo | null>(null)
  let audioRef: HTMLAudioElement | undefined
  let hls: Hls | null = null
  let audioResetTimer: ReturnType<typeof setInterval> | undefined

  // poll current position every second while playing
  let pollTimer: ReturnType<typeof setInterval> | undefined
  const startPoll = () => {
    stopPoll()
    pollTimer = setInterval(() => {
      if (!audioRef) return
      const pos = audioRef.currentTime
      if (pos > 0) getNowPlaying(pos).then(setNowPlaying).catch(() => {})

      // keep listener alive
      reportListener(0).catch(() => {})
    }, 1000)
  }
  const stopPoll = () => {
    if (pollTimer !== undefined) clearInterval(pollTimer)
    pollTimer = undefined
  }
  
  // reset audio element periodically during playback to sync with live broadcast
  const startAudioResetTimer = () => {
    stopAudioResetTimer()
    audioResetTimer = setInterval(() => {
      if (!audioRef || !isPlaying()) return
      getBroadcastPosition().then((pos) => {
        if (pos > 0) audioRef.currentTime = pos
      }).catch(() => {})
    }, 2000)
  }
  const stopAudioResetTimer = () => {
    if (audioResetTimer !== undefined) clearInterval(audioResetTimer)
    audioResetTimer = undefined
  }

  const destroyHls = () => {
    hls?.destroy()
    hls = null
  }

  const seekToLive = () => {
    if (!audioRef) return
    getBroadcastPosition().then((pos) => {
      if (audioRef && pos > 0) audioRef.currentTime = pos
    }).catch(() => {})
  }

  const attachStream = (seekLive = false): Promise<void> => {
    return new Promise((resolve) => {
      if (!audioRef) { resolve(); return }
      
      // completely reset audio element to avoid overlap and sync to live
      audioRef.pause()
      audioRef.currentTime = 0
      audioRef.removeAttribute('src')
      audioRef.load()
      
      setNowPlaying(null)

      const supportsNativeHls = audioRef.canPlayType('application/vnd.apple.mpegurl') !== ''
      if (supportsNativeHls) {
        audioRef.src = '/api/radio/stream'
        const onReady = () => {
          if (seekLive) seekToLive()
          resolve()
        }
        audioRef.addEventListener('loadedmetadata', onReady, { once: true })
        audioRef.addEventListener('error', () => resolve(), { once: true })
      } else if (Hls.isSupported()) {
        hls = new Hls()
        hls.loadSource('/api/radio/stream')
        hls.attachMedia(audioRef)
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (seekLive) seekToLive()
          resolve()
        })
        hls.on(Hls.Events.ERROR, () => resolve())
      } else {
        resolve()
      }
    })
  }

  const togglePlay = async () => {
    if (!audioRef) return
    
    if (isPlaying()) {
      stopPoll()
      stopAudioResetTimer()
      audioRef.pause()
      setIsPlaying(false)
      destroyHls()
      await reportListener(-1)
    } else {
      // First stop any existing playback to avoid overlap
      destroyHls()
      
      await reportListener(1)
      await attachStream(true)
      audioRef.play().then(() => {
        setIsPlaying(true)
        startPoll()
        startAudioResetTimer()
      }).catch(() => {})
    }
  }

  onCleanup(() => {
    stopPoll()
    stopAudioResetTimer()
    destroyHls()
    if (isPlaying()) {
      reportListener(-1).catch(() => {})
    }
  })

  return (
    <>
      <h1>{props.lang === 'ru' ? 'радио' : 'radio'}</h1>

      <div class="radio-player">
        <audio ref={audioRef} />
        <button class="shop-btn radio-play-btn" onClick={togglePlay}>
          {isPlaying() ? (props.lang === 'ru' ? 'стоп' : 'stop') : (props.lang === 'ru' ? 'слушать' : 'listen')}
        </button>
        <Show when={state()}>
          {(s) => (
            <div class="radio-info">
              <p class="radio-listeners">{props.lang === 'ru' ? 'слушателей' : 'listeners'}: {s().listeners}</p>
              <Show when={s().currentTrack}>
                <p class="radio-track">{s().currentTrack}</p>
              </Show>
            </div>
          )}
        </Show>
      </div>

      <Show when={nowPlaying()?.ok}>
        <div class="radio-now-playing">
          <Show when={nowPlaying()!.coverUrl}>
            <img
              class="radio-now-cover"
              src={nowPlaying()!.coverUrl!}
              alt={nowPlaying()!.album || ''}
              width="120"
              height="120"
            />
          </Show>
          <div class="radio-now-info">
            <p class="radio-now-track">{nowPlaying()!.title}</p>
            <p class="radio-now-artist">{nowPlaying()!.artist}</p>
            <p class="radio-now-album">{nowPlaying()!.album}</p>
            <div class="radio-now-progress">
              <span class="radio-now-elapsed">{fmtTime(nowPlaying()!.elapsed || 0)}</span>
              <progress class="radio-now-bar" value={nowPlaying()!.elapsed || 0} max={nowPlaying()!.duration || 0} />
              <span class="radio-now-duration">{fmtTime(nowPlaying()!.duration || 0)}</span>
            </div>
          </div>
        </div>
      </Show>

      <Show when={tracks() && tracks()!.length > 0} fallback={
        <p class="muted">{props.lang === 'ru' ? 'нет доступных треков' : 'no tracks available'}</p>
      }>
        <h2>{props.lang === 'ru' ? 'доступные треки' : 'available tracks'}</h2>
        <div class="radio-track-list">
          <For each={tracks()!}>
            {(track) => (
              <a class="radio-track-item" href={`/media/radio/${track}`} target="_blank">
                {track}
              </a>
            )}
          </For>
        </div>
      </Show>

      <Show when={state() && state()!.schedule.length > 0}>
        <h2>{props.lang === 'ru' ? 'расписание' : 'schedule'}</h2>
        <div class="radio-schedule">
          <For each={state()!.schedule}>
            {(slot) => (
              <div class="radio-schedule-slot">
                <span class="radio-schedule-day">{slot.day}</span>
                <span class="radio-schedule-time">{slot.start} – {slot.end}</span>
                <span class="radio-schedule-label">{slot.label}</span>
              </div>
            )}
          </For>
        </div>
      </Show>
    </>
  )
}
