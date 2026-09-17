export type RepeatMode = 'off' | 'all' | 'one'

export type UpcomingTrack = { index: number; track: GlobalPlayerTrack; duration: number | null }

export type GlobalPlayerTrack = {
  index: number
  title: string
  url: string
  streamUrl: string | null
  sourceUrl: string | null
  previewUrl: string | null
  fallbackUrl?: string
  duration: number | null
  trackLoudness?: number | null
  albumLoudness?: number | null
  isMain?: boolean
  links: {
    spotify: string | null
    yandexMusic: string | null
    bandcamp: string | null
    soundcloud: string | null
  }
}

export type GlobalPlayerQueue = {
  queueKey: string
  artist: string
  albumTitle: string
  coverUrl: string
  releaseDate: string
  genre: string
  tracks: GlobalPlayerTrack[]
}

export type RadioTrackInfo = {
  title: string
  artist: string
  album: string
  coverUrl: string | null
  elapsed: number
  duration: number
  /** Epoch ms at which the track began (server clock) — enables smooth local progress. */
  startTimestamp?: number | null
  source?: 'live' | 'estimated'
  upcoming: { title: string; artist: string; album: string; coverUrl: string; duration: number }[]
}

export type PlayerState = {
  queue: GlobalPlayerQueue | null
  currentIndex: number
  playing: boolean
  currentTime: number
  duration: number
  bufferedTime: number
  volume: number
  muted: boolean
  shuffleEnabled: boolean
  repeatMode: RepeatMode
  hasStartedPlayback: boolean
  playOrder: number[]
  orderPos: number
  trackDurations: Record<string, number>
  radioActive: boolean
  radioTrack: RadioTrackInfo | null
}

export type PersistedPlayerState = {
  queueKey: string
  currentIndex: number
  /** Original 1-based track index of the current item — survives queue reshapes (e.g. pre-order filtering). */
  trackIndex?: number | null
  currentTime: number
  volume: number
  muted: boolean
  shuffleEnabled: boolean
  repeatMode: RepeatMode
  hasStartedPlayback: boolean
  playOrder: number[]
  orderPos: number
  wasPlaying: boolean
}
