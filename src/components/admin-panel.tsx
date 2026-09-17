import { type Accessor, type Setter } from 'solid-js'
import type { Lang } from '@/types/content'
import type { AdminRelease, AdminShopProduct } from '@/types/admin'
import type { AdminOrder, AdminBanner, AdminUser, AdminSubmission, AdminArtist, AdminSupportTicket } from '@/lib/api/admin'
import type { ShopProductStatus } from '@/types/shop'
import type { PublicConfig } from '@/lib/api/config'
import { getLocaleDictionarySync } from '@/lib/i18n'

import { AdminPanel } from './admin/admin-panel'

export function __l(lang: string, en: string, ru: string): string { return lang === 'ru' ? ru : en }
export function _al(lang: string, key: string, en: string, ru: string): string { return (getLocaleDictionarySync(lang as 'en' | 'ru')?.admin as Record<string, string>)?.[key] || (lang === 'ru' ? ru : en) }

export type AdminPanelProps = {
  lang: Lang; isAdmin: boolean
  adminTab: Accessor<string>; setAdminTab: Setter<string>
  adminReleases: Accessor<AdminRelease[]>; adminShop: Accessor<AdminShopProduct[]>; adminOrders: Accessor<AdminOrder[]>
  adminEmail: Accessor<string>; adminProfileEmail: Accessor<string>; adminPassword: Accessor<string>
  adminStatus: Accessor<'idle' | 'loading' | 'error'>; adminMessage: Accessor<string>
  adminOrderEdit: Accessor<Record<string, { status: string; trackingNumber: string; trackingStatus: string; shippingEta: string; comment: string }>>
  setAdminOrderEdit: Setter<Record<string, { status: string; trackingNumber: string; trackingStatus: string; shippingEta: string; comment: string }>>
  releaseEdit: Accessor<{ albumName: string; notes: string; releaseType: string; releaseDate: string; hidden: boolean; links: { spotify: string; yandexMusic: string; bandcamp: string; soundcloud: string }; trackMeta: Record<string, { previewable: boolean; isMain: boolean }>; genres: { main: string[]; sub: string[] } }>; setReleaseEdit: Setter<{ albumName: string; notes: string; releaseType: string; releaseDate: string; hidden: boolean; links: { spotify: string; yandexMusic: string; bandcamp: string; soundcloud: string }; trackMeta: Record<string, { previewable: boolean; isMain: boolean }>; genres: { main: string[]; sub: string[] } }>
  releaseEditOpen: Accessor<string | null>; setReleaseEditOpen: Setter<string | null>
  shopEdit: Accessor<ShopEditState>; setShopEdit: Setter<ShopEditState>
  shopEditOpen: Accessor<string | null>; setShopEditOpen: Setter<string | null>
  setAdminEmail: Setter<string>; setAdminPassword: Setter<string>
  loadAdminData: () => Promise<void>
  submitAdminLogin: () => Promise<void>; submitAdminLogout: () => Promise<void>
  openReleaseEditor: (r: AdminRelease) => void; saveReleaseEditor: (r: AdminRelease) => Promise<string>
  removeRelease: (r: AdminRelease) => Promise<void>
  openShopEditor: (p?: AdminShopProduct) => void; saveShopEditor: (p?: AdminShopProduct) => Promise<void>
  removeShopProduct: (p: AdminShopProduct) => Promise<void>
  uploadShopImages: (p: AdminShopProduct, f: FileList | null) => Promise<void>
  removeShopImage: (p: AdminShopProduct, f: string) => Promise<void>
  setShopCover: (p: AdminShopProduct, f: string) => Promise<void>
  createAdminMockOrder: () => Promise<unknown>
  updateAdminOrder: (id: string, d: Record<string, string>) => Promise<unknown>
  adminBanners: Accessor<AdminBanner[]>; adminUsers: Accessor<AdminUser[]>
  adminSiteConfig: Accessor<Record<string, string | boolean>>
  publicConfig: Accessor<PublicConfig | null>
  createAdminRelease: (d: { albumName: string; releaseType: string; notes?: string }) => Promise<{ ok: boolean; slug: string }>
  uploadAdminReleaseCover: (s: string, f: File) => Promise<{ ok: boolean; coverUrl: string; coverPreviewUrl: string }>
  deleteAdminReleaseCover: (s: string) => Promise<{ ok: boolean }>
  reorderAdminGalleryImages: (s: string, o: string[]) => Promise<{ ok: boolean }>
  reorderAdminGalleryEntries: (o: string[]) => Promise<{ ok: boolean }>
  reorderAdminVideoEntries: (o: string[]) => Promise<{ ok: boolean }>
  reorderAdminShopImages: (s: string, o: string[]) => Promise<{ ok: boolean }>
  getAdminSiteConfig: () => Promise<{ ok: boolean; config: Record<string, string | boolean> }>
  updateAdminSiteConfig: (c: Record<string, string | boolean>) => Promise<{ ok: boolean }>
  getAdminBanners: () => Promise<{ ok: boolean; banners: AdminBanner[] }>
  createAdminBanner: (d: { page: string; text: string; active?: boolean }) => Promise<{ ok: boolean; id: number }>
  updateAdminBanner: (id: number, d: { text?: string; active?: boolean }) => Promise<{ ok: boolean }>
  deleteAdminBanner: (id: number) => Promise<{ ok: boolean }>
  getAdminUsers: () => Promise<{ ok: boolean; users: AdminUser[] }>
  updateAdminUser: (id: number, d: { email?: string; password?: string; ban?: boolean }) => Promise<{ ok: boolean }>
  deleteAdminUser: (id: number) => Promise<{ ok: boolean }>
  getAdminSubmissions: (status?: string) => Promise<{ ok: boolean; submissions: AdminSubmission[] }>
  reviewAdminSubmission: (id: number, body: { status: 'approved' | 'rejected'; feedback?: string; scheduledAt?: number | null }) => Promise<{ ok: boolean; status: string; scheduled?: boolean }>
  getAdminArtists: () => Promise<{ ok: boolean; artists: AdminArtist[] }>
  verifyAdminArtist: (id: number, verified: boolean) => Promise<{ ok: boolean; verified: boolean }>
  getAdminSupportTickets: (status?: string) => Promise<{ ok: boolean; tickets: AdminSupportTicket[] }>
  updateAdminSupportTicket: (id: number, data: { status?: string; adminNotes?: string }) => Promise<{ ok: boolean }>
}

export type ShopEditState = {
  title: string; category: string; price: number; status: ShopProductStatus
  quantity: number; descriptionEn: string; descriptionRu: string; coverImage: string
}

export { AdminPanel }
