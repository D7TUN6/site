import type { ShopProductStatus } from '@/types/shop'

export type AdminReleaseTrack = {
  filename: string
  title: string
}

export type AdminRelease = {
  slug: string
  albumName: string
  tracks: AdminReleaseTrack[]
  coverUrl: string | null
  notes: string
  releaseDate: string | null
  releaseType: string
}

export type AdminShopProduct = {
  slug: string
  title: string
  category: string
  price: number
  status: ShopProductStatus
  quantity: number
  images: string[]
  coverImage: string | null
  description: { en: string; ru: string }
}

export type AdminDashboard = {
  releases: AdminRelease[]
  shopProducts: AdminShopProduct[]
}
