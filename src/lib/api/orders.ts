import { apiFetchJson } from '@/lib/api/http'

export type OrderSummary = {
  id: string
  status: string
  total: { currency: string; value: string }
  shippingProvider: string
  pickupPoint: unknown
  shippingEta: string | null
  createdAt: number
  updatedAt: number
}

export function createOrder(payload: {
  shippingProvider: string
  pickupPoint: unknown
  comment: string
  items: Array<{ slug: string; title: string; unitAmount: number; quantity: number }>
}) {
  return apiFetchJson<{ ok: boolean; orderId: string }>('/api/orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getMyOrders() {
  return apiFetchJson<{ ok: boolean; orders: OrderSummary[] }>('/api/orders/mine')
}
