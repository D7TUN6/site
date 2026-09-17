import { apiFetchJson } from '@/lib/api/http'
import type { GalleryEntry } from '@/types/content'

export function getGalleryEntries(artistSlug?: string) {
  const q = artistSlug ? `?artist_slug=${encodeURIComponent(artistSlug)}` : ''
  return apiFetchJson<{ ok: boolean; entries: GalleryEntry[] }>(`/api/gallery/entries${q}`)
}

export function getGalleryEntry(slug: string, artistSlug?: string) {
  const q = artistSlug ? `?artist_slug=${encodeURIComponent(artistSlug)}` : ''
  return apiFetchJson<{ ok: boolean; entry: GalleryEntry }>(`/api/gallery/entries/${encodeURIComponent(slug)}${q}`)
}
