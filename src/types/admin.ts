import type { ShopProductStatus } from '@/types/shop'

type AdminReleaseTrack = {
  filename: string
  title: string
  previewable?: boolean
  isMain?: boolean
}

export type AdminRelease = {
  slug: string
  albumName: string
  tracks: AdminReleaseTrack[]
  coverUrl: string | null
  coverPreviewUrl?: string | null
  notes: string
  releaseDate: string | null
  releaseType: string
  hidden?: boolean
  links?: {
    spotify: string | null
    yandexMusic: string | null
    bandcamp: string | null
    soundcloud: string | null
  }
  genres?: {
    main: string[]
    sub: string[]
  }
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
