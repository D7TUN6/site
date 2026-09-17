import { apiFetchJson } from '@/lib/api/http'

export type SupportTicket = {
  id: number
  userId: number
  subject: string
  message: string
  category: string
  status: string
  adminNotes: string
  createdAt: number
  updatedAt: number
}

export const SUPPORT_CATEGORIES = ['technical', 'billing', 'content', 'account', 'feature', 'other'] as const

export function createSupportTicket(body: { subject: string; message: string; category?: string }) {
  return apiFetchJson<{ ok: boolean; id: number }>('/api/support', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function getMySupportTickets() {
  return apiFetchJson<{ ok: boolean; tickets: SupportTicket[] }>('/api/support')
}
