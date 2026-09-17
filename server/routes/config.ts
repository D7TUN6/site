import { Elysia } from 'elysia'
import type { DatabaseSync } from '../lib/sqlite.js'
import { getOptionalEnv } from '../lib/config.js'
import { getFeatureFlags } from '../routes/admin/site-config.js'
import { listActiveBanners } from '../routes/admin/banners.js'

let _db: DatabaseSync | null = null

export function initConfigDb(db: DatabaseSync) {
  _db = db
}

export function buildPublicConfig() {
  const features = _db ? getFeatureFlags(_db) : {}
  const banners: Record<string, Array<{ id: number; text: string }>> = {}
  if (_db) {
    for (const page of ['shop', 'music', 'main', 'bio', 'donate', 'news', 'blog', 'gallery', 'video', 'radio']) {
      banners[page] = listActiveBanners(_db, page)
    }
  }
  return {
    ok: true,
    features,
    banners,
    websiteArtist: getOptionalEnv('WEBSITE_ARTIST', 'D7TUN6'),
    yandexMapsApiKey: getOptionalEnv('YANDEX_MAPS_JS_API_KEY', '') || getOptionalEnv('YANDEX_MAPS_API_KEY', '') || null,
    yandexSearchEnabled: Boolean(getOptionalEnv('YANDEX_MAPS_SEARCH_API_KEY', '')),
    yookassa: {
      shopId: getOptionalEnv('YOOKASSA_SHOP_ID', '') || null,
      returnUrl: getOptionalEnv('YOOKASSA_RETURN_URL', '') || null,
    },
  }
}

export function createConfigRouter() {
  return new Elysia({ prefix: '/api/config' })
    .get('/', ({ set }) => {
      set.headers['cache-control'] = 'public, max-age=60, stale-while-revalidate=600'
      set.status = 200
      return buildPublicConfig()
    })
}
