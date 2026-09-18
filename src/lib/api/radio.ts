import type { NowPlayingInfo, RadioState } from '@/types/content'

export async function getRadioState(): Promise<RadioState> {
  const res = await fetch('/api/radio/state')
  if (!res.ok) throw new Error(`Failed to fetch radio state: ${res.status}`)
  return res.json() as Promise<RadioState>
}

const LISTENER_ID_KEY = 'd7tun6-radio-listener-id'

// A stable per-tab id so one listener is counted once even when its requests
// arrive from different addresses (IPv4/IPv6, changing Cloudflare edges). The
// server falls back to the client IP when the id is absent.
function getListenerId(): string {
  if (typeof window === 'undefined') return 'server'
  try {
    const existing = window.sessionStorage.getItem(LISTENER_ID_KEY)
    if (existing) return existing
    const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
    window.sessionStorage.setItem(LISTENER_ID_KEY, id)
    return id
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  }
}

export async function reportListener(delta: number): Promise<void> {
  await fetch('/api/radio/listeners', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ delta, id: getListenerId() }),
  })
}

export async function getNowPlaying(): Promise<NowPlayingInfo> {
  const res = await fetch('/api/radio/now-playing')
  if (!res.ok) return { ok: false }
  return res.json() as Promise<NowPlayingInfo>
}


