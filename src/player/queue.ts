import type { Lang, ReleaseEntry } from '@/types/content'

export type GlobalPlayerTrack = {
  index: number
  title: string
  url: string
  streamUrl: string | null
  sourceUrl: string | null
  previewUrl: string | null
  duration: number | null
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

export function buildPlayerQueueFromRelease(release: ReleaseEntry, lang: Lang): GlobalPlayerQueue {
  return {
    queueKey: release.slug,
    artist: 'D7TUN6',
    albumTitle: release.albumName,
    coverUrl: release.coverPreviewUrl || release.coverUrl,
    releaseDate: release.releaseDate,
    genre: lang === 'ru' ? release.genre.ru : release.genre.en,
    tracks: release.tracks.map((track) => ({
      index: track.index,
      title: track.title,
      url: track.url,
      streamUrl: track.streamUrl,
      sourceUrl: track.sourceUrl,
      previewUrl: track.previewUrl,
      duration: track.duration,
      links: track.links,
    })),
  }
}
