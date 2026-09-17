import type { Lang, ReleaseEntry } from '@/types/content'
import { isPreOrder, isTrackLocked } from '@/lib/releasePreorder'
import type { GlobalPlayerTrack, GlobalPlayerQueue } from './types.js'

export type { GlobalPlayerTrack, GlobalPlayerQueue }

export function buildPlayerQueueFromRelease(release: ReleaseEntry, lang: Lang): GlobalPlayerQueue {
  // During pre-order only previewable tracks are queued.
  const queueTracks = isPreOrder(release)
    ? release.tracks.filter((t) => !isTrackLocked(release, t))
    : release.tracks
  return {
    queueKey: release.slug,
    artist: release.artist || '',
    albumTitle: release.albumName,
    coverUrl: release.coverPreviewUrl || release.coverUrl,
    releaseDate: release.releaseDate,
    genre: release.genres?.main?.[0] || release.genres?.sub?.[0] || (lang === 'ru' ? release.genre.ru : release.genre.en),
    tracks: queueTracks.map((track) => ({
      index: track.index,
      title: track.title,
      url: track.url,
      streamUrl: track.streamUrl,
      sourceUrl: track.sourceUrl,
      fallbackUrl: track.sourceUrl ?? undefined,
      previewUrl: track.previewUrl,
      duration: track.duration,
      trackLoudness: track.trackLoudness ?? null,
      albumLoudness: track.albumLoudness ?? null,
      isMain: track.isMain === true,
      links: track.links,
    })),
  }
}
