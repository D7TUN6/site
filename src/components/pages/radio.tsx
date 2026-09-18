import { For, Show, createMemo, createResource, onCleanup, onMount } from 'solid-js'
import { getRadioState } from '@/lib/api/radio'
import { usePlayer } from '@/features/player/usePlayer'
import { SkeletonBlock } from '@/components/skeleton'
import type { Lang, RadioState } from '@/types/content'

type ScheduleSlot = RadioState['schedule'][number]

// Reuse the previously resolved state when nothing actually changed, so a
// 3-second refetch that comes back identical is a complete no-op: solid's
// createResource skips the value update (=== reference) and no reactive
// consumer re-runs — zero DOM writes and zero repaints on every poll tick.
let lastStateRef: RadioState | null = null

function radioStateEquals(a: RadioState, b: RadioState): boolean {
  if (
    a.isLive !== b.isLive ||
    a.listeners !== b.listeners ||
    a.currentTrack !== b.currentTrack ||
    a.streamUrl !== b.streamUrl ||
    a.trackCount !== b.trackCount ||
    a.regeneratedAt !== b.regeneratedAt ||
    a.schedule.length !== b.schedule.length
  ) return false
  for (let i = 0; i < a.schedule.length; i++) {
    const s1 = a.schedule[i]
    const s2 = b.schedule[i]
    if (s1.day !== s2.day || s1.start !== s2.start || s1.end !== s2.end || s1.label !== s2.label) return false
  }
  return true
}

async function getRadioStateStable(): Promise<RadioState> {
  try {
    const fresh = await getRadioState()
    const last = lastStateRef
    if (last && radioStateEquals(last, fresh)) return last
    lastStateRef = fresh
    return fresh
  } catch (err) {
    // A refetch must never surface an error: reading `state.latest` throws on
    // error, which would take the whole route down with it. Keep serving the
    // last good state instead.
    if (lastStateRef) return lastStateRef
    throw err
  }
}

// Server rebuilds schedule objects on every /api/radio/state call; reusing
// identical slots by key keeps <For> node identities stable across refetches
// so the schedule rows are never re-cloned (no visual flash on each reload).
const scheduleCache = new Map<string, ScheduleSlot>()

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function RadioPage(props: {
  lang: Lang
}) {
  const player = usePlayer()
  const [state, { refetch }] = createResource(getRadioStateStable)

  onMount(() => {
    const id = window.setInterval(() => refetch(), 3000)
    onCleanup(() => window.clearInterval(id))
  })

  const schedule = createMemo(() => {
    const raw = state.latest?.schedule
    if (!raw) return [] as ScheduleSlot[]
    const out: ScheduleSlot[] = new Array(raw.length)
    for (let i = 0; i < raw.length; i++) {
      const slot = raw[i]
      const key = `${slot.day}\u0000${slot.start}`
      const cached = scheduleCache.get(key)
      if (cached && cached.end === slot.end && cached.label === slot.label) {
        out[i] = cached
      } else {
        scheduleCache.set(key, slot)
        out[i] = slot
      }
    }
    return out
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

      <div class="radio-player">
        <button class="shop-btn radio-play-btn" onClick={toggle}>
          {isPlaying() ? (props.lang === 'ru' ? 'стоп' : 'stop') : (props.lang === 'ru' ? 'слушать' : 'listen')}
        </button>
        <Show when={state.latest} fallback={
          <div class="radio-info">
            <SkeletonBlock height="11px" width="96px" class="radio-listeners" />
          </div>
        }>
          <div class="radio-info">
            <p class="radio-listeners">{props.lang === 'ru' ? 'слушателей' : 'listeners'}: {state.latest!.listeners}</p>
          </div>
        </Show>
      </div>

      <Show when={nowPlaying()}>
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
            <p class="radio-now-artist">{nowPlaying()!.artist}{isPlaying() ? '' : props.lang === 'ru' ? ' · пауза' : ' · paused'}</p>
            <p class="radio-now-album">{nowPlaying()!.album}</p>
            <div class="radio-now-progress">
              <span class="radio-now-elapsed">{fmtTime(nowPlaying()!.elapsed || 0)}</span>
              <div class="radio-now-bar" role="progressbar" aria-valuemin={0} aria-valuemax={nowPlaying()!.duration || 0} aria-valuenow={nowPlaying()!.elapsed || 0} aria-label="Live position">
                <span class="radio-now-bar-fill" style={{ width: `${progressPct()}%` }} />
              </div>
              <span class="radio-now-duration">{fmtTime(nowPlaying()!.duration || 0)}</span>
            </div>
          </div>
        </div>
      </Show>

      <Show when={state.latest && state.latest.schedule.length > 0}>
        <h2>{props.lang === 'ru' ? 'расписание' : 'schedule'}</h2>
        <div class="radio-schedule">
          <For each={schedule()}>
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