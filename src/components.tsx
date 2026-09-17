import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js'
import { getPublicConfig } from './lib/api/config'
import { searchPickupPoints, type PickupPoint } from './lib/api/shipping'
import { loadYandexMaps, type YMapsApi } from './lib/yandexMaps'
import { loadYooKassaWidgetScript } from './lib/yookassaWidget'
import type { Lang } from './types/content'

type YmapsGeoResult = {
  geometry?: { getCoordinates?: () => number[] }
  properties?: { get?: (key: string) => string }
  getAddressLine?: () => string
}
type YooMoneyWidget = {
  render(containerId: string): void
  on?(event: 'success' | 'fail', cb: () => void): void
  destroy?(): void
}

export { UiSelect } from '@/components/ui-select'
export { ProjectsIndex } from '@/components/projects-index'
export { OssMigrationWizard } from '@/components/oss-migrator'
export { NowPlayingBar } from '@/components/now-playing-bar'
export { ShopPage, ShopProductPage } from '@/components/pages/shop'
export { CartPage } from '@/components/pages/cart'
export { AccountPage } from '@/components/pages/account'
export { MusicPage, ReleasePage } from '@/components/pages/music'
export { NewsIndex, NewsPost } from '@/components/pages/news'
export { BlogIndex, BlogPost } from '@/components/pages/blog'

export function PickupPointPicker(props: { lang: Lang; provider: string; city: string; value: PickupPoint | null; onChange: (value: PickupPoint | null) => void }) {
  const [query, setQuery] = createSignal('')
  const [points, setPoints] = createSignal<PickupPoint[]>([])
  const [msg, setMsg] = createSignal('')
  const [cfg, setCfg] = createSignal<{ yandexMapsApiKey: string | null } | null>(null)

  createEffect(() => { void getPublicConfig().then((v) => setCfg({ yandexMapsApiKey: v.yandexMapsApiKey })).catch(() => setCfg(null)) })

  // Track the previous provider/city to avoid resetting on every render
  let prevProvider: string | null = null
  let prevCity: string | null = null
  createEffect(() => {
    const provider = props.provider
    const city = props.city
    const providerChanged = prevProvider !== null && provider !== prevProvider
    const cityChanged = prevCity !== null && city !== prevCity
    prevProvider = provider
    prevCity = city
    if (providerChanged || cityChanged) {
      props.onChange(null)
      setPoints([])
      setMsg('')
    }
  })

  const canSearch = createMemo(() => Boolean(props.provider !== 'custom' && props.city.trim()))
  const fallbackLabel = () => {
    if (props.provider === 'cdek') return 'СДЭК пункт выдачи'
    if (props.provider === 'russian_post') return 'Почта России отделение'
    if (props.provider === 'ozon') return 'Ozon пункт выдачи'
    if (props.provider === 'avito') return 'Avito доставка пункт выдачи'
    return props.lang === 'ru' ? 'пункт выдачи' : 'pickup point'
  }
  const hashId = (input: string) => {
    let hash = 2166136261
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i)
      hash = Math.imul(hash, 16777619)
    }
    return `pt_${(hash >>> 0).toString(16)}`
  }
  const searchViaYmaps = async (text: string) => {
    const key = cfg()?.yandexMapsApiKey
    if (!key) throw new Error(props.lang === 'ru' ? 'Не задан ключ Яндекс.Карт' : 'Yandex Maps API key is missing')
    const ymaps = await loadYandexMaps(key, props.lang === 'ru' ? 'ru_RU' : 'en_US')
    const result = await Promise.resolve(ymaps.geocode?.(text, { results: 40 }))
    const geoObjects = (result as { geoObjects?: { toArray: () => unknown } } | undefined)?.geoObjects
    const items = typeof geoObjects?.toArray === 'function' ? geoObjects.toArray() : []
    const mapped = (items as YmapsGeoResult[]).map((obj: YmapsGeoResult) => {
      const coords = obj?.geometry?.getCoordinates?.()
      const lat = Array.isArray(coords) && Number.isFinite(coords[0]) ? Number(coords[0]) : null
      const lon = Array.isArray(coords) && Number.isFinite(coords[1]) ? Number(coords[1]) : null
      if (lat == null || lon == null) return null
      const nameRaw = obj?.properties?.get?.('name') ?? obj?.properties?.get?.('text') ?? ''
      const addressRaw = obj?.getAddressLine?.() ?? obj?.properties?.get?.('text') ?? ''
      const name = typeof nameRaw === 'string' ? nameRaw : String(nameRaw || '')
      const address = typeof addressRaw === 'string' ? addressRaw : String(addressRaw || '')
      const id = hashId(`${props.provider}:${name}:${address}:${lat}:${lon}`)
      return { id, provider: props.provider, name: name || text, address, lat, lon } as PickupPoint
    }).filter(Boolean) as PickupPoint[]
    return mapped
  }

  const doSearch = async () => {
    if (!canSearch()) return
    const q = query().trim() || fallbackLabel()
    const text = props.city ? `${q}, ${props.city}` : q
    try {
      const result = await searchPickupPoints(props.provider, query().trim(), props.city)
      setPoints((result.points || []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon)))
      setMsg('')
    } catch (e) {
      try {
        const fallback = await searchViaYmaps(text)
        setPoints(fallback.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon)))
        setMsg('')
      } catch {
        console.warn('Yandex Maps geocode search failed')
        setPoints([])
        setMsg(e instanceof Error ? e.message : 'Search failed')
      }
    }
  }

  let mapEl: HTMLDivElement | undefined
  let map: InstanceType<YMapsApi['Map']> | null = null
  let ymapsRef: YMapsApi | null = null
  let marks: unknown[] = []

  const clearMarks = () => {
    for (const m of marks) map?.geoObjects?.remove?.(m)
    marks = []
  }

  createEffect(() => {
    const key = cfg()?.yandexMapsApiKey
    const lang = props.lang
    if (!key || !mapEl) return
    void loadYandexMaps(key, lang === 'ru' ? 'ru_RU' : 'en_US')
      .then((ymaps) => {
        ymapsRef = ymaps
        if (!map) map = new ymaps.Map(mapEl!, { center: [55.751244, 37.618423], zoom: 9, controls: ['zoomControl'] })
        setMsg('')
      })
      .catch(() => setMsg(lang === 'ru' ? 'Карта не загрузилась (проверь ключ/csp)' : 'Map failed to load (check key/csp)'))
  })

  createEffect(() => {
    const list = points()
    const onChange = props.onChange
    if (!map || !ymapsRef) return
    clearMarks()
    for (const p of list) {
      const mark = new ymapsRef.Placemark([p.lat, p.lon], { balloonContent: `<b>${p.name}</b><br/>${p.address}` }, { preset: 'islands#blueIcon' })
      mark.events.add('click', () => onChange(p))
      map.geoObjects.add(mark)
      marks.push(mark)
    }
    const bounds = map.geoObjects.getBounds()
    if (bounds) map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 24 })
  })

  onCleanup(() => {
    clearMarks()
    map?.destroy?.()
    map = null
  })

  return <div class='pickup'>
    <div class='checkout-grid'>
      <label class='form-field'><span class='form-label'>{props.lang === 'ru' ? 'поиск ПВЗ' : 'pickup search'}</span><input class='form-input' value={query()} onInput={(e) => setQuery(e.currentTarget.value)} /></label>
      <div class='form-field'><button class='shop-btn' type='button' disabled={!canSearch()} onClick={doSearch}>{props.lang === 'ru' ? 'найти' : 'search'}</button></div>
    </div>
    <Show when={msg()}><p class='checkout-hint'>{msg()}</p></Show>
    <div class='pickup-grid'>
      <div class='pickup-list'>
        <For each={points()}>{(p) => <button type='button' class={`pickup-item ${props.value?.id === p.id ? 'is-active' : ''}`} aria-pressed={props.value?.id === p.id} onClick={() => props.onChange(p)}><div class='pickup-name'>{p.name}</div><div class='pickup-address'>{p.address}</div></button>}</For>
      </div>
      <div class='pickup-map'><div ref={mapEl} class='pickup-map-inner' /></div>
    </div>
  </div>
}

export function YooKassaWidget(props: { confirmationToken: string; returnUrl: string; onSuccess: () => void; onFail: () => void; onError: (m: string) => void }) {
  const containerId = `payment-form-${Math.random().toString(16).slice(2)}`
  createEffect(() => {
    const { confirmationToken, returnUrl, onSuccess, onFail, onError } = props
    let widget: YooMoneyWidget | undefined
    void loadYooKassaWidgetScript().then(() => {
      const Ctor = window.YooMoneyCheckoutWidget!
      if (!Ctor) return onError('YooKassa widget is not available')
      widget = new Ctor({ confirmation_token: confirmationToken, return_url: returnUrl }) as YooMoneyWidget
      widget.on?.('success', onSuccess)
      widget.on?.('fail', onFail)
      return Promise.resolve(widget.render(containerId))
    }).catch((e) => onError(e instanceof Error ? e.message : 'Unable to load widget'))
    onCleanup(() => { try { widget?.destroy?.() } catch { console.warn('Failed to destroy YooKassa widget') } })
  })
  return <div class='yookassa'><div id={containerId} class='yookassa-container' /></div>
}
