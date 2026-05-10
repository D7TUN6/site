import { apiFetchJson } from '@/lib/api/http'

export function createYookassaPayment(orderId: string) {
  return apiFetchJson<{ ok: boolean; orderId: string; paymentId: string; status: string; confirmationToken: string }>('/api/payments/yookassa/create', {
    method: 'POST',
    body: JSON.stringify({ orderId }),
  })
}
