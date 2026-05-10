import type { ReleaseEntry } from "@/types/content";

export type GlobalPlayerTrack = {
  title: string;
  url: string;
  streamUrl?: string | null;
  fallbackUrl?: string | null;
  duration?: number | null;
  links?: {
    spotify: string | null;
    yandexMusic: string | null;
    bandcamp: string | null;
    soundcloud: string | null;
  };
};

export type GlobalPlayerQueue = {
  queueKey: string;
  albumSlug: string;
  albumTitle: string;
  artist: string;
  coverUrl: string;
  releaseDate: string;
  genre: string;
  tracks: GlobalPlayerTrack[];
};

export function buildPlayerQueueFromRelease(release: ReleaseEntry, lang: "en" | "ru" = "en"): GlobalPlayerQueue {
  return {
    queueKey: release.slug,
    albumSlug: release.slug,
    albumTitle: release.albumName,
    artist: "D7TUN6",
    coverUrl: release.coverPreviewUrl || release.coverUrl,
    releaseDate: release.releaseDate,
    genre: lang === "ru" ? release.genre.ru : release.genre.en,
    tracks: release.tracks.map((track) => ({
      title: track.title,
      url: track.url,
      streamUrl: track.streamUrl,
      fallbackUrl: track.sourceUrl,
      duration: track.duration,
      links: track.links
    }))
  };
}
