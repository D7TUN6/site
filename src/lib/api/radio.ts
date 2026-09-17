import type { NowPlayingInfo, RadioState } from '@/types/content'

export async function getRadioState(): Promise<RadioState> {
  const res = await fetch('/api/radio/state')
  if (!res.ok) throw new Error(`Failed to fetch radio state: ${res.status}`)
  return res.json() as Promise<RadioState>
}

export async function reportListener(delta: number): Promise<void> {
  await fetch('/api/radio/listeners', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ delta }),
  })
}

export async function getNowPlaying(): Promise<NowPlayingInfo> {
  const res = await fetch('/api/radio/now-playing')
  if (!res.ok) return { ok: false }
  return res.json() as Promise<NowPlayingInfo>
}


