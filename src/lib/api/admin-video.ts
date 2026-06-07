import { apiFetchJson } from '@/lib/api/http'

export type AdminVideoEntry = {
  slug: string
  title: string
  date: string
  thumbnail: string
  sources: Array<{ url: string; type: string; resolution?: string }>
}

export function getAdminVideo() {
  return apiFetchJson<{ ok: boolean; entries: AdminVideoEntry[] }>('/api/admin/video')
}

export function createAdminVideo(data: { title: string; date?: string }) {
  return apiFetchJson<{ ok: boolean; slug: string }>('/api/admin/video', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function uploadAdminVideo(slug: string, file: File) {
  const fd = new FormData()
  fd.append('file', file)
  const response = await fetch(`/api/admin/video/${encodeURIComponent(slug)}/upload`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-Requested-With': 'fetch' },
    body: fd,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'Upload failed')
  return payload as { ok: boolean; slug: string; thumbnail: string; playlist: string }
}

export function updateAdminVideo(slug: string, patch: { title?: string; date?: string }) {
  return apiFetchJson<{ ok: boolean }>(`/api/admin/video/${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export function deleteAdminVideo(slug: string) {
  return apiFetchJson<{ ok: boolean }>(`/api/admin/video/${encodeURIComponent(slug)}`, {
    method: 'DELETE',
    body: JSON.stringify({}),
  })
}
