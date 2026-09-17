import { apiFetchJson } from '@/lib/api/http'

export function getAdminRadio() {
  return apiFetchJson<{ ok: boolean; tracks: string[]; schedule: Array<{ day: string; start: string; end: string; label: string }> }>('/api/admin/radio')
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
