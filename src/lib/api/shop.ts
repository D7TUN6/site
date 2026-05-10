import type { ShopProduct } from '@/types/shop'
import { apiFetchJson } from '@/lib/api/http'

export function getShopManifest() {
  return apiFetchJson<{ products: ShopProduct[] }>('/api/shop/manifest')
}
