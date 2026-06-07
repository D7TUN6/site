import { apiFetchJson } from '@/lib/api/http'
import type { VideoEntry } from '@/types/content'

export function getVideoEntries() {
  return apiFetchJson<{ ok: boolean; entries: VideoEntry[] }>('/api/video/entries')
}

export function getVideoEntry(slug: string) {
  return apiFetchJson<{ ok: boolean; entry: VideoEntry }>(`/api/video/entries/${encodeURIComponent(slug)}`)
}
