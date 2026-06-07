import type { NowPlayingInfo, RadioState } from '@/types/content'

export async function getRadioState(): Promise<RadioState> {
  const res = await fetch('/api/radio/state')
  if (!res.ok) throw new Error(`Failed to fetch radio state: ${res.status}`)
  return res.json() as Promise<RadioState>
}

export async function getRadioTracks(): Promise<string[]> {
  const res = await fetch('/api/radio/tracks')
  if (!res.ok) throw new Error(`Failed to fetch radio tracks: ${res.status}`)
  const data = await res.json() as { ok: boolean; tracks: string[] }
  return data.tracks
}

export async function reportListener(delta: number): Promise<void> {
  await fetch('/api/radio/listeners', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ delta }),
  })
}

export async function getNowPlaying(position: number): Promise<NowPlayingInfo> {
  const res = await fetch('/api/radio/now-playing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ position }),
  })
  if (!res.ok) return { ok: false }
  return res.json() as Promise<NowPlayingInfo>
}

export async function getBroadcastPosition(): Promise<number> {
  const res = await fetch('/api/radio/broadcast')
  if (!res.ok) return 0
  const data = await res.json() as { ok: boolean; position: number }
  return data.position
}
