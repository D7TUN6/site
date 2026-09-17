import { apiFetchJson } from '@/lib/api/http'

export type PickupPoint = { id: string; provider: string; name: string; address: string; lat: number; lon: number }

export function searchPickupPoints(provider: string, q: string, city: string) {
  const params = new URLSearchParams({ provider, q, city })
  return apiFetchJson<{ ok: boolean; provider: string; points: PickupPoint[] }>(`/api/shipping/pickup-points?${params.toString()}`)
}
