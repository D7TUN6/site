import { For, Show, createResource, onCleanup, onMount } from 'solid-js'
import { getRadioState } from '@/lib/api/radio'
import { usePlayer } from '@/features/player/usePlayer'
import { SkeletonBlock } from '@/components/skeleton'
import type { Lang } from '@/types/content'

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function RadioPage(props: {
  lang: Lang
}) {
  const player = usePlayer()
  const [state, { refetch }] = createResource(getRadioState)

  onMount(() => {
    const id = window.setInterval(() => refetch(), 3000)
    onCleanup(() => window.clearInterval(id))
  })

  const isPlaying = () => player.state.radioActive && player.state.playing
  const nowPlaying = () => player.state.radioTrack
  const progressPct = () => {
    const np = nowPlaying()
    if (!np || np.duration <= 0) return 0
    return Math.max(0, Math.min(100, (np.elapsed / np.duration) * 100))
  }

  const toggle = () => {
    if (player.state.radioActive) player.stopRadio()
    else void player.startRadio()
  }

  return (
    <>
      <h1>{props.lang === 'ru' ? 'радио' : 'radio'}</h1>

      <Show when={!state.loading} fallback={
        <div>
          <div style={{ display: 'flex', gap: '11px', 'align-items': 'center', 'margin-bottom': '16px' }}>
            <SkeletonBlock height="30px" width="80px" />
            <SkeletonBlock height="11px" width="96px" />
          </div>
          <SkeletonBlock height="14px" width="144px" style={{ 'margin-bottom': '10px' }} />
          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '5px' }}>
            {Array.from({ length: 5 }, () => (
              <SkeletonBlock height="26px" />
            ))}
          </div>
        </div>
      }>

      <div class="radio-player">
        <button class="shop-btn radio-play-btn" onClick={toggle}>
          {isPlaying() ? (props.lang === 'ru' ? 'стоп' : 'stop') : (props.lang === 'ru' ? 'слушать' : 'listen')}
        </button>
        <Show when={state()}>
          {(s) => (
            <div class="radio-info">
              <p class="radio-listeners">{props.lang === 'ru' ? 'слушателей' : 'listeners'}: {s().listeners}</p>
            </div>
          )}
        </Show>
      </div>

      <Show when={nowPlaying()}>
        {(np) => (
          <div class="radio-now-playing">
            <Show when={np().coverUrl}>
              <img
                class="radio-now-cover"
                src={np().coverUrl!}
                alt={np().album || ''}
                width="120"
                height="120"
              />
            </Show>
            <div class="radio-now-info">
              <p class="radio-now-track">{np().title}</p>
              <p class="radio-now-artist">{np().artist}{isPlaying() ? '' : props.lang === 'ru' ? ' · пауза' : ' · paused'}</p>
              <p class="radio-now-album">{np().album}</p>
              <div class="radio-now-progress">
                <span class="radio-now-elapsed">{fmtTime(np().elapsed || 0)}</span>
                <div class="radio-now-bar" role="progressbar" aria-valuemin={0} aria-valuemax={np().duration || 0} aria-valuenow={np().elapsed || 0} aria-label="Live position">
                  <span class="radio-now-bar-fill" style={{ width: `${progressPct()}%` }} />
                </div>
                <span class="radio-now-duration">{fmtTime(np().duration || 0)}</span>
              </div>
            </div>
          </div>
        )}
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
      </Show>
    </>
  )
}