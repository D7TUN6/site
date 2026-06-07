import { apiFetchJson } from '@/lib/api/http'
import type { StorageFile } from '@/types/content'

export function getStorageList(path = '') {
  const qs = path ? `?path=${encodeURIComponent(path)}` : ''
  return apiFetchJson<{ ok: boolean; entries: StorageFile[] }>(`/api/storage/list${qs}`)
}

export function storageMkdir(path: string) {
  return apiFetchJson<{ ok: boolean }>('/api/storage/mkdir', {
    method: 'POST',
    body: JSON.stringify({ path }),
  })
}

export function storageRemove(path: string) {
  return apiFetchJson<{ ok: boolean }>('/api/storage/remove', {
    method: 'DELETE',
    body: JSON.stringify({ path }),
  })
}

export function storageRead(path: string) {
  return apiFetchJson<{ ok: boolean; content: string }>(`/api/storage/read?path=${encodeURIComponent(path)}`)
}

export function storageWrite(path: string, content: string) {
  return apiFetchJson<{ ok: boolean }>('/api/storage/write', {
    method: 'POST',
    body: JSON.stringify({ path, content }),
  })
}

export async function storageUpload(files: FileList | File[], path = '') {
  const fd = new FormData()
  for (const file of files) fd.append('files', file)
  const qs = path ? `?path=${encodeURIComponent(path)}` : ''
  const response = await fetch(`/api/storage/upload${qs}`, {
    method: 'POST',
    credentials: 'include',
    body: fd,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'Upload failed')
  return payload as { ok: boolean; files: string[] }
}
