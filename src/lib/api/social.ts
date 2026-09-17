export type PlayCategory = 'skip' | 'partial' | 'full'

export type LikesData = {
  ok: boolean
  hidden: boolean
  albumLikes: number
  trackLikes: Record<number, number>
  userAlbumLiked: boolean
  userTrackLiked: number[]
}

export type MetricsData = {
  ok: boolean
  hidden: boolean
  plays: { total: number; skip: number; partial: number; full: number }
  trackPlays: Array<{ track_index: number; category: string; count: number }>
  albumLikes: number
  trackLikes: Record<number, number>
}

export type AnalyticsRow = Record<string, unknown>

export type AnalyticsSummary = Array<Record<string, unknown>>

export type AnalyticsResponse = {
  ok: boolean
  rows: AnalyticsRow[]
  summary: AnalyticsSummary
  total: number
}

async function apiPost(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function apiGet(url: string): Promise<Response> {
  return fetch(url, { credentials: 'include' })
}

export async function toggleLike(targetType: 'album' | 'track', targetSlug: string, trackIndex?: number): Promise<{ liked: boolean }> {
  const res = await apiPost('/api/social/likes/toggle', { targetType, targetSlug, trackIndex })
  if (!res.ok) throw new Error('Failed to toggle like')
  return res.json()
}

export async function getLikes(slug: string): Promise<LikesData> {
  const res = await apiGet(`/api/social/likes/${encodeURIComponent(slug)}`)
  if (!res.ok) throw new Error('Failed to get likes')
  return res.json()
}

export async function recordPlay(releaseSlug: string, trackIndex: number, category: PlayCategory): Promise<void> {
  await apiPost('/api/social/plays', { releaseSlug, trackIndex, category })
}

export async function getMetrics(slug: string): Promise<MetricsData> {
  const res = await apiGet(`/api/social/metrics/${encodeURIComponent(slug)}`)
  if (!res.ok) throw new Error('Failed to get metrics')
  return res.json()
}

export async function getAnalyticsPlays(params: {
  range?: string; slug?: string; sortBy?: string; sortOrder?: string; search?: string; offset?: number; limit?: number
}): Promise<AnalyticsResponse> {
  const q = new URLSearchParams()
  if (params.range) q.set('range', params.range)
  if (params.slug) q.set('slug', params.slug)
  if (params.sortBy) q.set('sortBy', params.sortBy)
  if (params.sortOrder) q.set('sortOrder', params.sortOrder)
  if (params.search) q.set('search', params.search)
  if (params.offset) q.set('offset', String(params.offset))
  if (params.limit) q.set('limit', String(params.limit))
  const res = await apiGet(`/api/social/analytics/plays?${q.toString()}`)
  if (!res.ok) throw new Error('Failed to get play analytics')
  return res.json()
}

export async function getAnalyticsLikes(params: {
  range?: string; slug?: string; sortBy?: string; sortOrder?: string; search?: string; offset?: number; limit?: number
}): Promise<AnalyticsResponse> {
  const q = new URLSearchParams()
  if (params.range) q.set('range', params.range)
  if (params.slug) q.set('slug', params.slug)
  if (params.sortBy) q.set('sortBy', params.sortBy)
  if (params.sortOrder) q.set('sortOrder', params.sortOrder)
  if (params.search) q.set('search', params.search)
  if (params.offset) q.set('offset', String(params.offset))
  if (params.limit) q.set('limit', String(params.limit))
  const res = await apiGet(`/api/social/analytics/likes?${q.toString()}`)
  if (!res.ok) throw new Error('Failed to get like analytics')
  return res.json()
}

export async function toggleSocialMetricsVisibility(slug: string, hidden: boolean): Promise<{ ok: boolean; hidden: boolean }> {
  const res = await fetch(`/api/social/admin/metrics/${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hidden }),
  })
  if (!res.ok) throw new Error('Failed to toggle social metrics')
  return res.json()
}
