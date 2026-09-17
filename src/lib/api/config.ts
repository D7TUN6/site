import { apiFetchJson } from '@/lib/api/http'

export type PublicConfig = {
  ok: boolean
  features: Record<string, boolean>
  banners: Record<string, Array<{ id: number; text: string }>>
  websiteArtist: string
  yandexMapsApiKey: string | null
  yandexSearchEnabled: boolean
  yookassa: { shopId: string | null; returnUrl: string | null }
}

export function getPublicConfig(): Promise<PublicConfig> {
  return apiFetchJson<PublicConfig>('/api/config')
}
