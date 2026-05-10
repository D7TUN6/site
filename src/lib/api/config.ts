import { apiFetchJson } from '@/lib/api/http'

export function getPublicConfig() {
  return apiFetchJson<{ ok: boolean; yandexMapsApiKey: string | null; yandexSearchEnabled: boolean; yookassa: { shopId: string | null; returnUrl: string | null } }>('/api/config')
}
