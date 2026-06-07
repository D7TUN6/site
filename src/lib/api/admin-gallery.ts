import { apiFetchJson } from '@/lib/api/http'

export type AdminGalleryEntry = {
  slug: string
  title: string
  date: string
  tags: string[]
  images: string[]
  cover: string
}

export function getAdminGallery() {
  return apiFetchJson<{ ok: boolean; entries: AdminGalleryEntry[] }>('/api/admin/gallery')
}

export function createAdminGallery(data: { title: string; date?: string; tags?: string[] }) {
  return apiFetchJson<{ ok: boolean; slug: string }>('/api/admin/gallery', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function uploadAdminGalleryImages(slug: string, files: FileList | File[]) {
  const fd = new FormData()
  for (const file of files) fd.append('file', file)
  const response = await fetch(`/api/admin/gallery/${encodeURIComponent(slug)}/images`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-Requested-With': 'fetch' },
    body: fd,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'Upload failed')
  return payload as { ok: boolean; files: string[] }
}

export function updateAdminGallery(slug: string, patch: { title?: string; date?: string; tags?: string[] }) {
  return apiFetchJson<{ ok: boolean }>(`/api/admin/gallery/${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export function deleteAdminGallery(slug: string) {
  return apiFetchJson<{ ok: boolean }>(`/api/admin/gallery/${encodeURIComponent(slug)}`, {
    method: 'DELETE',
    body: JSON.stringify({}),
  })
}

export function deleteAdminGalleryImage(slug: string, filename: string) {
  return apiFetchJson<{ ok: boolean }>(`/api/admin/gallery/${encodeURIComponent(slug)}/images/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
    body: JSON.stringify({}),
  })
}
