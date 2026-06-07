import type { AdminRelease, AdminShopProduct } from '@/types/admin'
import type { ShopProductStatus } from '@/types/shop'
import { apiFetchJson } from '@/lib/api/http'

export function getAdminReleases() {
  return apiFetchJson<{ ok: boolean; releases: AdminRelease[] }>('/api/admin/releases')
}

export function getAdminShop() {
  return apiFetchJson<{ ok: boolean; products: AdminShopProduct[] }>('/api/admin/shop')
}

export function getAdminMe() {
  return apiFetchJson<{ ok: boolean; isAdmin: boolean; email: string | null }>('/api/admin/me')
}

export function adminLogin(payload: { email: string; password: string }) {
  return apiFetchJson<{ ok: boolean }>('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function adminLogout() {
  return apiFetchJson<{ ok: boolean }>('/api/admin/logout', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export function updateAdminRelease(slug: string, patch: {
  albumName?: string
  notes?: string
  releaseType?: string
  releaseDate?: string
  trackRenames?: Record<string, string>
  trackDeletes?: string[]
  hidden?: boolean
}) {
  return apiFetchJson<{ ok: boolean; slug?: string }>(`/api/admin/releases/${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export function deleteAdminRelease(slug: string) {
  return apiFetchJson<{ ok: boolean }>(`/api/admin/releases/${encodeURIComponent(slug)}`, {
    method: 'DELETE',
    body: JSON.stringify({}),
  })
}

export function createAdminShopProduct(data: {
  title: string
  category: string
  price: number
  status: ShopProductStatus
  quantity: number
  descriptionEn: string
  descriptionRu: string
}) {
  return apiFetchJson<{ ok: boolean; slug: string }>('/api/admin/shop', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateAdminShopProduct(slug: string, patch: Partial<{
  title: string
  category: string
  price: number
  status: ShopProductStatus
  quantity: number
  descriptionEn: string
  descriptionRu: string
  coverImage: string
  images: string[]
}>) {
  return apiFetchJson<{ ok: boolean }>(`/api/admin/shop/${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export function deleteAdminShopProduct(slug: string) {
  return apiFetchJson<{ ok: boolean }>(`/api/admin/shop/${encodeURIComponent(slug)}`, {
    method: 'DELETE',
    body: JSON.stringify({}),
  })
}

export async function uploadAdminShopImages(slug: string, files: File[]) {
  const fd = new FormData()
  for (const file of files) fd.append('file', file)
  const response = await fetch(`/api/admin/shop/${encodeURIComponent(slug)}/images`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-Requested-With': 'fetch' },
    body: fd,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'Upload failed')
  return payload as { ok: boolean; files: string[] }
}

export function deleteAdminShopImage(slug: string, filename: string) {
  return apiFetchJson<{ ok: boolean }>(`/api/admin/shop/${encodeURIComponent(slug)}/images/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
    body: JSON.stringify({}),
  })
}


export type AdminOrder = {
  id: string
  userId: number
  email: string
  status: string
  itemsTotalMinor: number
  shippingProvider: string
  pickupPoint: unknown
  comment: string
  payment: { provider: string | null; id: string | null; status: string | null; amountMinor: number | null; paidAt: number | null }
  shippingEta: string | null
  tracking: { number: string | null; status: string | null }
  createdAt: number
  updatedAt: number
}

export function getAdminOrders(limit = 100) {
  return apiFetchJson<{ ok: boolean; orders: AdminOrder[] }>(`/api/admin/orders?limit=${limit}`)
}

export function updateAdminOrder(orderId: string, patch: Partial<{ status: string; trackingNumber: string; trackingStatus: string; shippingEta: string; comment: string; pickupPoint: unknown }>) {
  return apiFetchJson<{ ok: boolean }>(`/api/admin/orders/${encodeURIComponent(orderId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export function createAdminMockOrder() {
  return apiFetchJson<{ ok: boolean; orderId: string }>('/api/admin/orders/mock', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

// ─── New: Create Release ───
export function createAdminRelease(data: { albumName: string; releaseType: string; notes?: string }) {
  return apiFetchJson<{ ok: boolean; slug: string }>('/api/admin/releases', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

// ─── New: Release Cover ───
export async function uploadAdminReleaseCover(slug: string, file: File) {
  const fd = new FormData()
  fd.append('file', file)
  const response = await fetch(`/api/admin/releases/${encodeURIComponent(slug)}/cover`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-Requested-With': 'fetch' },
    body: fd,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'Upload failed')
  return payload as { ok: boolean; coverUrl: string; coverPreviewUrl: string }
}

export function deleteAdminReleaseCover(slug: string) {
  return apiFetchJson<{ ok: boolean }>(`/api/admin/releases/${encodeURIComponent(slug)}/cover`, {
    method: 'DELETE',
    body: JSON.stringify({}),
  })
}

// ─── New: Reorder Gallery Images ───
export function reorderAdminGalleryImages(slug: string, order: string[]) {
  return apiFetchJson<{ ok: boolean }>(`/api/admin/gallery/${encodeURIComponent(slug)}/images/reorder`, {
    method: 'POST',
    body: JSON.stringify({ order }),
  })
}

// ─── New: Reorder Gallery Entries ───
export function reorderAdminGalleryEntries(order: string[]) {
  return apiFetchJson<{ ok: boolean }>('/api/admin/gallery/reorder', {
    method: 'POST',
    body: JSON.stringify({ order }),
  })
}

// ─── New: Reorder Video Entries ───
export function reorderAdminVideoEntries(order: string[]) {
  return apiFetchJson<{ ok: boolean }>('/api/admin/video/reorder', {
    method: 'POST',
    body: JSON.stringify({ order }),
  })
}

// ─── New: Reorder Shop Images ───
export function reorderAdminShopImages(slug: string, order: string[]) {
  return apiFetchJson<{ ok: boolean }>(`/api/admin/shop/${encodeURIComponent(slug)}/images/reorder`, {
    method: 'POST',
    body: JSON.stringify({ order }),
  })
}

// ─── New: Site Config ───
export function getAdminSiteConfig() {
  return apiFetchJson<{ ok: boolean; config: Record<string, string | boolean> }>('/api/admin/site-config')
}

export function updateAdminSiteConfig(config: Record<string, string | boolean>) {
  return apiFetchJson<{ ok: boolean }>('/api/admin/site-config', {
    method: 'POST',
    body: JSON.stringify({ config }),
  })
}

// ─── New: Banners ───
export type AdminBanner = { id: number; page: string; text: string; active: number; created_at: number; updated_at: number }

export function getAdminBanners() {
  return apiFetchJson<{ ok: boolean; banners: AdminBanner[] }>('/api/admin/banners')
}

export function createAdminBanner(data: { page: string; text: string; active?: boolean }) {
  return apiFetchJson<{ ok: boolean; id: number }>('/api/admin/banners', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateAdminBanner(id: number, data: { text?: string; active?: boolean }) {
  return apiFetchJson<{ ok: boolean }>(`/api/admin/banners/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export function deleteAdminBanner(id: number) {
  return apiFetchJson<{ ok: boolean }>(`/api/admin/banners/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({}),
  })
}

// ─── New: Users ───
export type AdminUser = { id: number; email: string; email_verified: number; banned: number; banned_at: number | null; created_at: number; updated_at: number }

export function getAdminUsers() {
  return apiFetchJson<{ ok: boolean; users: AdminUser[] }>('/api/admin/users')
}

export function updateAdminUser(id: number, data: { email?: string; password?: string; ban?: boolean }) {
  return apiFetchJson<{ ok: boolean }>(`/api/admin/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export function deleteAdminUser(id: number) {
  return apiFetchJson<{ ok: boolean }>(`/api/admin/users/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({}),
  })
}
