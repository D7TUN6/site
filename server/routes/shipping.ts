import express from 'express'
import { getOptionalEnv } from '../lib/config.js'

function normalizeProvider(raw: unknown) {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (value === 'cdek' || value === 'russian_post' || value === 'ozon' || value === 'avito' || value === 'custom') return value
  return null
}

function safeText(raw: unknown, max = 120) {
  const value = typeof raw === 'string' ? raw.trim() : ''
  return value ? value.slice(0, max) : ''
}

export function createShippingRouter() {
  const router = express.Router()
  router.get('/providers', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({ ok: true, providers: [
      { id: 'cdek', label: 'CDEK' },
      { id: 'russian_post', label: 'Почта РФ' },
      { id: 'ozon', label: 'Ozon' },
      { id: 'avito', label: 'Avito' },
      { id: 'custom', label: 'Other' },
    ] })
  })

  router.get('/pickup-points', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const key = getOptionalEnv('YANDEX_MAPS_SEARCH_API_KEY', '')
    if (!key) return res.status(501).json({ error: 'YANDEX_MAPS_SEARCH_API_KEY is not configured' })
    const provider = normalizeProvider(req.query.provider)
    if (!provider) return res.status(400).json({ error: 'Invalid provider' })
    const city = safeText(req.query.city, 80)
    const q = safeText(req.query.q, 120) || 'пункт выдачи'
    const text = city ? `${q}, ${city}` : q
    const params = new URLSearchParams({ apikey: key, text, type: 'biz', lang: 'ru_RU', results: '40' })
    const r = await fetch(`https://search-maps.yandex.ru/v1/?${params.toString()}`)
    if (!r.ok) return res.status(502).json({ error: 'Pickup points lookup failed' })
    const payload = await r.json() as any
    const features = Array.isArray(payload?.features) ? payload.features : []
    const points = features.map((f: any) => {
      const p = f?.properties ?? {}
      const c = Array.isArray(f?.geometry?.coordinates) ? f.geometry.coordinates : []
      const lon = Number(c?.[0]); const lat = Number(c?.[1])
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
      const name = typeof p?.name === 'string' ? p.name : q
      const address = typeof p?.CompanyMetaData?.address === 'string' ? p.CompanyMetaData.address : (typeof p?.description === 'string' ? p.description : '')
      const id = typeof p?.CompanyMetaData?.id === 'string' ? p.CompanyMetaData.id : `pt_${Math.abs((name+address).split('').reduce((a:number,ch:string)=>((a<<5)-a)+ch.charCodeAt(0),0)).toString(16)}`
      return { id, provider, name, address, lat, lon }
    }).filter(Boolean)
    return res.status(200).json({ ok: true, provider, points })
  })

  return router
}
