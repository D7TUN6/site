import { apiFetchJson } from '@/lib/api/http'

export function getAdminRadio() {
  return apiFetchJson<{ ok: boolean; tracks: string[]; schedule: Array<{ day: string; start: string; end: string; label: string }> }>('/api/admin/radio')
}

export async function uploadAdminRadioTracks(files: FileList | File[]) {
  const fd = new FormData()
  for (const file of files) fd.append('file', file)
  const response = await fetch('/api/admin/radio/tracks', {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-Requested-With': 'fetch' },
    body: fd,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'Upload failed')
  return payload as { ok: boolean; files: string[] }
}

export function updateAdminRadioSchedule(schedule: Array<{ day: string; start: string; end: string; label: string }>) {
  return apiFetchJson<{ ok: boolean }>('/api/admin/radio/schedule', {
    method: 'POST',
    body: JSON.stringify({ schedule }),
  })
}

export function regenerateAdminRadioStream() {
  return apiFetchJson<{ ok: boolean }>('/api/admin/radio/regenerate-stream', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export function deleteAdminRadioTrack(filename: string) {
  return apiFetchJson<{ ok: boolean }>(`/api/admin/radio/tracks/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
    body: JSON.stringify({}),
  })
}
