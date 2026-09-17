import { apiFetchJson } from '@/lib/api/http'
import type { VideoEntry } from '@/types/content'

export function getVideoEntries(artistSlug?: string) {
  const params = new URLSearchParams()
  params.set('_t', String(Date.now()))
  if (artistSlug) params.set('artist_slug', artistSlug)
  return apiFetchJson<{ ok: boolean; entries: VideoEntry[] }>(`/api/video/entries?${params.toString()}`)
}

export function getVideoEntry(slug: string, artistSlug?: string) {
  const params = new URLSearchParams()
  params.set('_t', String(Date.now()))
  if (artistSlug) params.set('artist_slug', artistSlug)
  return apiFetchJson<{ ok: boolean; entry: VideoEntry }>(`/api/video/entries/${encodeURIComponent(slug)}?${params.toString()}`)
}

export type VideoStats = {
  ok: boolean
  totalViews: number
  totalLikes: number
  userLiked: boolean
}

export async function getVideoStats(slug: string): Promise<VideoStats> {
  const res = await fetch(`/api/social/video-stats/${encodeURIComponent(slug)}`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to get video stats')
  return res.json()
}

export async function recordVideoView(videoSlug: string, durationWatched: number, completed: boolean): Promise<void> {
  await fetch('/api/social/video-views', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoSlug, durationWatched, completed }),
  })
}

export async function toggleVideoLike(targetSlug: string): Promise<{ liked: boolean }> {
  const res = await fetch('/api/social/video-likes/toggle', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetSlug }),
  })
  if (!res.ok) throw new Error('Failed to toggle video like')
  return res.json()
}
