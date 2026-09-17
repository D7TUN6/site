import { apiFetchJson } from '@/lib/api/http'

export type AdminVideoEntry = {
  slug: string
  title: string
  date: string
  thumbnail: string
  description: string
  sources: Array<{ url: string; type: string; resolution?: string }>
}

export function getAdminVideo() {
  return apiFetchJson<{ ok: boolean; entries: AdminVideoEntry[] }>('/api/admin/video')
}

export function createAdminVideo(data: { title: string; date?: string; description?: string }) {
  return apiFetchJson<{ ok: boolean; slug: string }>('/api/admin/video', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function uploadAdminVideoWithProgress(slug: string, file: File, onProgress?: (loaded: number, total: number) => void): Promise<{ ok: boolean; slug: string; thumbnail: string; playlist: string }> {
  return new Promise((resolve, reject) => {
    const fd = new FormData()
    fd.append('file', file)
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/admin/video/${encodeURIComponent(slug)}/upload`)
    xhr.setRequestHeader('X-Requested-With', 'fetch')
    xhr.withCredentials = true
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded, e.total)
    }
    xhr.onload = () => {
      try {
        const payload = JSON.parse(xhr.responseText)
        if (xhr.status >= 200 && xhr.status < 300) resolve(payload)
        else reject(new Error(payload.error || 'Upload failed'))
      } catch { reject(new Error('Invalid response')) }
    }
    xhr.ontimeout = () => reject(new Error('Upload timed out'))
    xhr.onerror = () => reject(new Error('Network error'))
    xhr.send(fd)
  })
}

export function updateAdminVideo(slug: string, patch: { title?: string; date?: string; description?: string }) {
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

export function generateVideoThumbnails(slug: string) {
  return apiFetchJson<{ ok: boolean; thumbnails: string[] }>(`/api/admin/video/${encodeURIComponent(slug)}/generate-thumbnails`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export function setVideoThumbnail(slug: string, thumbnail: string) {
  return apiFetchJson<{ ok: boolean; thumbnail: string }>(`/api/admin/video/${encodeURIComponent(slug)}/thumbnail`, {
    method: 'POST',
    body: JSON.stringify({ thumbnail }),
  })
}

export async function uploadVideoThumbnail(slug: string, file: File) {
  const fd = new FormData()
  fd.append('file', file)
  const response = await fetch(`/api/admin/video/${encodeURIComponent(slug)}/thumbnail`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-Requested-With': 'fetch' },
    body: fd,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'Upload failed')
  return payload as { ok: boolean; thumbnail: string }
}
