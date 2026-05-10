import { apiFetchJson } from '@/lib/api/http'

export type ShippingProvider = { id: string; label: string }
export type PickupPoint = { id: string; provider: string; name: string; address: string; lat: number; lon: number }

export function getShippingProviders() {
  return apiFetchJson<{ ok: boolean; providers: ShippingProvider[] }>('/api/shipping/providers')
}

export function searchPickupPoints(provider: string, q: string, city: string) {
  const params = new URLSearchParams({ provider, q, city })
  return apiFetchJson<{ ok: boolean; provider: string; points: PickupPoint[] }>(`/api/shipping/pickup-points?${params.toString()}`)
}
