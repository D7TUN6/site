import { apiFetchJson } from '@/lib/api/http'
import type { GalleryEntry } from '@/types/content'

export function getGalleryEntries() {
  return apiFetchJson<{ ok: boolean; entries: GalleryEntry[] }>('/api/gallery/entries')
}

export function getGalleryEntry(slug: string) {
  return apiFetchJson<{ ok: boolean; entry: GalleryEntry }>(`/api/gallery/entries/${encodeURIComponent(slug)}`)
}
