import { createStore } from 'solid-js/store'
import type { GlobalPlayerQueue } from '@/player/queue'

export type RepeatMode = 'off' | 'all' | 'one'

export type PlayerState = {
  queue: GlobalPlayerQueue | null
  currentIndex: number
  playing: boolean
  progress: number
  duration: number
  shuffleEnabled: boolean
  repeatMode: RepeatMode
  hasStartedPlayback: boolean
}

const [state, setState] = createStore<PlayerState>({
  queue: null,
  currentIndex: 0,
  playing: false,
  progress: 0,
  duration: 0,
  shuffleEnabled: false,
  repeatMode: 'off',
  hasStartedPlayback: false,
})

export function usePlayerStore() {
  const setQueue = (queue: GlobalPlayerQueue) => {
    setState({
      queue,
      currentIndex: 0,
      progress: 0,
      duration: queue.tracks[0]?.duration ?? 0,
      hasStartedPlayback: true,
    })
  }

  const playTrack = (index: number) => {
    if (!state.queue) return
    if (index < 0 || index >= state.queue.tracks.length) return
    setState({
      currentIndex: index,
      playing: true,
      progress: 0,
      duration: state.queue.tracks[index]?.duration ?? 0,
      hasStartedPlayback: true,
    })
  }

  const togglePlay = () => {
    if (!state.queue) return
    setState('playing', (v) => !v)
  }

  return { state, setQueue, playTrack, togglePlay }
}
