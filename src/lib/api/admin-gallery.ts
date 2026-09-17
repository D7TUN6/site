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

export function uploadAdminGalleryImagesWithProgress(slug: string, files: FileList | File[], onProgress?: (loaded: number, total: number) => void): Promise<{ ok: boolean; files: string[] }> {
  return new Promise((resolve, reject) => {
    const fd = new FormData()
    for (const file of files) fd.append('file', file)
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/admin/gallery/${encodeURIComponent(slug)}/images`)
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
    xhr.onerror = () => reject(new Error('Network error'))
    xhr.send(fd)
  })
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
