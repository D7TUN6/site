import type { Lang } from '@/types/content'

export type LocalizedThanksCard = { id: string; name: string; role: string; text: string; avatar: string; url: string }
export type WebringSite = { id: string; name: string; url: string; badge: string; owner: string }
export type LocalizedSpecial = {
  bio: string
  thanks: LocalizedThanksCard[]
  webring: WebringSite[]
  bannerHtml: string
}

export async function fetchSpecial(lang: Lang): Promise<LocalizedSpecial> {
  const res = await fetch(`/api/special?lang=${lang}`, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`Failed to load special content: ${res.status}`)
  const data = (await res.json()) as { ok?: boolean; special?: LocalizedSpecial }
  if (!data.ok || !data.special) throw new Error('Invalid special payload')
  return data.special
}

export function subscribeSpecial(
  lang: Lang,
  onData: (special: LocalizedSpecial) => void,
  onStatus?: (connected: boolean) => void,
): () => void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') return () => {}
  const source = new EventSource(`/api/special/events?lang=${lang}`)
  const onMessage = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data) as { ok?: boolean; special?: LocalizedSpecial }
      if (data.ok && data.special) onData(data.special)
    } catch {
      // ignore malformed frames / heartbeats
    }
  }
  source.addEventListener('message', onMessage)
  source.addEventListener('open', () => onStatus?.(true))
  source.addEventListener('error', () => onStatus?.(false))
  return () => {
    source.removeEventListener('message', onMessage)
    source.close()
  }
}
