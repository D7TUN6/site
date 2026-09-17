import { Elysia } from 'elysia'
import { getOptionalEnv } from '../lib/config.js'
import { serverFetch } from '../lib/http-agent.js'

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
  return new Elysia({ prefix: '/api/shipping' })
    .get('/providers', ({ set }) => {
      set.headers['cache-control'] = 'no-store'
      set.status = 200
      return { ok: true, providers: [
        { id: 'cdek', label: 'CDEK' },
        { id: 'russian_post', label: 'Почта РФ' },
        { id: 'ozon', label: 'Ozon' },
        { id: 'avito', label: 'Avito' },
        { id: 'custom', label: 'Other' },
      ] }
    })
    .get('/pickup-points', async ({ query, set }) => {
      set.headers['cache-control'] = 'no-store'
      const key = getOptionalEnv('YANDEX_MAPS_SEARCH_API_KEY', '')
      if (!key) {
        set.status = 501
        return { error: 'YANDEX_MAPS_SEARCH_API_KEY is not configured' }
      }
      const provider = normalizeProvider(query.provider)
      if (!provider) {
        set.status = 400
        return { error: 'Invalid provider' }
      }
      const city = safeText(query.city, 80)
      const q = safeText(query.q, 120) || 'пункт выдачи'
      const text = city ? `${q}, ${city}` : q
      const params = new URLSearchParams({ apikey: key, text, type: 'biz', lang: 'ru_RU', results: '40' })
      const r = await serverFetch(`https://search-maps.yandex.ru/v1/?${params}`)
      if (!r.ok) {
        set.status = 502
        return { error: 'Pickup points lookup failed' }
      }
      type YandexMapsResponse = { features?: Array<{ properties?: Record<string, unknown>; geometry?: { coordinates?: unknown[] } }> }
      const payload = await r.json() as YandexMapsResponse
      const features = Array.isArray(payload?.features) ? payload.features : []
      const points = features.map((f) => {
        const p = f?.properties ?? {}
        const c = Array.isArray(f?.geometry?.coordinates) ? f.geometry.coordinates : []
        const lon = Number(c?.[0]); const lat = Number(c?.[1])
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
        const name = typeof p?.name === 'string' ? p.name : q
        const meta = p?.CompanyMetaData as { address?: string; id?: string } | undefined
        const address = typeof meta?.address === 'string' ? meta.address : (typeof p?.description === 'string' ? p.description : '')
        const id = typeof meta?.id === 'string' ? meta.id : `pt_${Math.abs((name+address).split('').reduce((a:number,ch:string)=>((a<<5)-a)+ch.charCodeAt(0),0)).toString(16)}`
        return { id, provider, name, address, lat, lon }
      }).filter(Boolean)
      set.status = 200
      return { ok: true, provider, points }
    })
}
