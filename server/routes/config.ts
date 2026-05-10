import express from 'express'
import { getOptionalEnv } from '../lib/config.js'

export function createConfigRouter() {
  const router = express.Router()
  router.get('/', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({
      ok: true,
      yandexMapsApiKey: getOptionalEnv('YANDEX_MAPS_JS_API_KEY', '') || getOptionalEnv('YANDEX_MAPS_API_KEY', '') || null,
      yandexSearchEnabled: Boolean(getOptionalEnv('YANDEX_MAPS_SEARCH_API_KEY', '')),
      yookassa: {
        shopId: getOptionalEnv('YOOKASSA_SHOP_ID', '') || null,
        returnUrl: getOptionalEnv('YOOKASSA_RETURN_URL', '') || null,
      },
    })
  })
  return router
}
