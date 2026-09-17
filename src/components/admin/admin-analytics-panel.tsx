import { For, Show, createMemo, createSignal } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { Lang } from '@/types/content'
import type { AdminRelease } from '@/types/admin'
import { UiSelect, type UiSelectOption } from '@/components/ui-select'

function __l(lang: string, en: string, ru: string): string { return lang === 'ru' ? ru : en }

export function AdminAnalyticsPanel(props: { lang: Lang; releases: Accessor<AdminRelease[]> }) {
  const trackName = (releaseSlug: string, index: number): string => {
    const release = props.releases().find((r) => r.slug === releaseSlug)
    if (!release || !release.tracks) return String(index)
    return release.tracks[index]?.title ?? String(index)
  }
  const [mediaType, setMediaType] = createSignal<'audio' | 'video'>('audio')
  const [tab, setTab] = createSignal<'plays' | 'likes'>('plays')
  const [range, setRange] = createSignal('all')
  const [slug, setSlug] = createSignal('')
  const [sortBy, setSortBy] = createSignal('created_at')
  const [sortOrder, setSortOrder] = createSignal<'asc' | 'desc'>('desc')
  const [search, setSearch] = createSignal('')
  const [data, setData] = createSignal<{ rows: unknown[]; summary: unknown[]; total: number } | null>(null)
  const [videoData, setVideoData] = createSignal<{ rows: unknown[]; summary: unknown[]; likesSummary: unknown[]; total: number } | null>(null)
  const [videoTab, setVideoTab] = createSignal<'views' | 'likes'>('views')
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const RANGES = [
    { value: 'day', label: { en: 'Day', ru: 'День' } },
    { value: 'week', label: { en: 'Week', ru: 'Неделя' } },
    { value: 'month', label: { en: 'Month', ru: 'Месяц' } },
    { value: 'quarter', label: { en: 'Quarter', ru: 'Квартал' } },
    { value: 'year', label: { en: 'Year', ru: 'Год' } },
    { value: 'all', label: { en: 'All time', ru: 'Всё время' } },
  ]

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      if (mediaType() === 'audio') {
        const { getAnalyticsPlays, getAnalyticsLikes } = await import('@/lib/api/social')
        const params: Record<string, string | undefined> = { range: range() === 'all' ? undefined : range(), slug: slug() || undefined, search: search() || undefined, sortBy: sortBy(), sortOrder: sortOrder() }
        const res = tab() === 'plays' ? await getAnalyticsPlays(params) : await getAnalyticsLikes(params)
        setData({ rows: res.rows, summary: res.summary ?? [], total: res.total })
        setVideoData(null)
      } else {
        const q = new URLSearchParams()
        if (range() !== 'all') q.set('range', range())
        if (slug()) q.set('slug', slug())
        if (search()) q.set('search', search())
        q.set('offset', '0'); q.set('limit', '500')
        const res = await fetch(`/api/social/analytics/video-views?${q.toString()}`, { credentials: 'include' })
        if (!res.ok) throw new Error('Failed to load video analytics')
        const json = await res.json()
        setVideoData({ rows: json.rows, summary: json.summary, likesSummary: json.likesSummary, total: json.total })
        setData(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics')
    }
    setLoading(false)
  }

  const handleSearch = () => { fetchData() }

  const releaseOptions = createMemo<UiSelectOption[]>(() => [
    { value: '', label: __l(props.lang, 'All', 'Все') },
    ...props.releases().map((r) => ({ value: r.slug, label: r.albumName })),
  ])

  const sortOptions = createMemo<UiSelectOption[]>(() => {
    const base = [
      { value: 'created_at', label: __l(props.lang, 'By date', 'По дате') },
      { value: 'release_slug', label: __l(props.lang, 'By release', 'По релизу') },
    ]
    if (tab() === 'plays') {
      base.push(
        { value: 'track_index', label: __l(props.lang, 'By track', 'По треку') },
        { value: 'category', label: __l(props.lang, 'By category', 'По категории') },
      )
    }
    if (tab() === 'likes') {
      base.push({ value: 'target_type', label: __l(props.lang, 'By type', 'По типу') })
    }
    return base
  })

  return (
    <section class="admin-orders">
      <div class="auth-actions" style="margin-bottom:12px">
        <button type="button" class={`shop-btn ${mediaType() === 'audio' ? 'is-active' : 'shop-btn-secondary'}`} onClick={() => { setMediaType('audio'); setTimeout(fetchData, 0) }}>
          {__l(props.lang, 'Audio', 'Аудио')}
        </button>
        <button type="button" class={`shop-btn ${mediaType() === 'video' ? 'is-active' : 'shop-btn-secondary'}`} onClick={() => { setMediaType('video'); setTimeout(fetchData, 0) }}>
          {__l(props.lang, 'Video', 'Видео')}
        </button>
      </div>
      <Show when={mediaType() === 'audio'}>
        <div class="auth-actions" style="margin-bottom:12px">
          <button type="button" class={`shop-btn ${tab() === 'plays' ? 'is-active' : 'shop-btn-secondary'}`} onClick={() => { setTab('plays'); setTimeout(fetchData, 0) }}>
            {__l(props.lang, 'Plays', 'Прослушивания')}
          </button>
          <button type="button" class={`shop-btn ${tab() === 'likes' ? 'is-active' : 'shop-btn-secondary'}`} onClick={() => { setTab('likes'); setTimeout(fetchData, 0) }}>
            {__l(props.lang, 'Likes', 'Лайки')}
          </button>
        </div>
      </Show>
      <Show when={mediaType() === 'video'}>
        <div class="auth-actions" style="margin-bottom:12px">
          <button type="button" class={`shop-btn ${videoTab() === 'views' ? 'is-active' : 'shop-btn-secondary'}`} onClick={() => { setVideoTab('views'); setTimeout(fetchData, 0) }}>
            {__l(props.lang, 'Views', 'Просмотры')}
          </button>
          <button type="button" class={`shop-btn ${videoTab() === 'likes' ? 'is-active' : 'shop-btn-secondary'}`} onClick={() => { setVideoTab('likes'); setTimeout(fetchData, 0) }}>
            {__l(props.lang, 'Likes', 'Лайки')}
          </button>
        </div>
      </Show>

      <div class="auth-actions" style="flex-wrap:wrap;gap:6px;margin-bottom:12px">
        <For each={RANGES}>
          {(r) => (
            <button type="button" class={`shop-btn ${range() === r.value ? 'is-active' : 'shop-btn-secondary'}`} onClick={() => { setRange(r.value); setTimeout(fetchData, 0) }}>
              {__l(props.lang, r.label.en, r.label.ru)}
            </button>
          )}
        </For>
      </div>

      <div class="auth-actions" style="gap:8px;margin-bottom:12px">
        <label class="form-field" style="flex:1;min-width:120px">
          <span class="form-label">{mediaType() === 'video' ? (__l(props.lang, 'Video', 'Видео')) : (__l(props.lang, 'Release', 'Релиз'))}</span>
          <UiSelect modelValue={slug()} options={releaseOptions()} onChange={(v) => { setSlug(v); setTimeout(fetchData, 0) }} />
        </label>
        <label class="form-field" style="flex:1;min-width:120px">
          <span class="form-label">{__l(props.lang, 'Sort by', 'Сортировка')}</span>
          <UiSelect modelValue={sortBy()} options={sortOptions()} onChange={(v) => { setSortBy(v); setTimeout(fetchData, 0) }} />
        </label>
        <label class="form-field" style="width:80px">
          <span class="form-label">{__l(props.lang, 'Order', 'Порядок')}</span>
          <button type="button" class={`shop-btn ${sortOrder() === 'desc' ? 'is-active' : 'shop-btn-secondary'}`} onClick={() => { setSortOrder((v) => v === 'desc' ? 'asc' : 'desc'); setTimeout(fetchData, 0) }}>
            {sortOrder() === 'desc' ? '↓' : '↑'}
          </button>
        </label>
        <label class="form-field" style="flex:1;min-width:160px">
          <span class="form-label">{__l(props.lang, 'Search', 'Поиск')}</span>
          <input class="form-input" value={search()} onInput={(e) => setSearch(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter') fetchData() }} placeholder={__l(props.lang, 'search by slug...', 'поиск по slug...')} />
        </label>
        <div style="align-self:flex-end">
          <button class="shop-btn" onClick={handleSearch}>{__l(props.lang, 'Search', 'Найти')}</button>
        </div>
      </div>

      <Show when={loading()}>
        <div class="release-download-spinner" style="margin:24px auto" />
      </Show>

      <Show when={error()}>
        <p class="checkout-hint" style="color:var(--danger-color)">{error()}</p>
      </Show>

      <Show when={mediaType() === 'audio' && data() && !loading()}>
        <p style="font-family:var(--font-ui);font-size:0.85rem;color:var(--muted-color);margin-bottom:12px">
          {__l(props.lang, 'Total entries', 'Всего записей')}: {data()!.total}
        </p>

        <Show when={data()!.summary.length > 0}>
          <h3 style="font-family:var(--font-ui);font-size:0.9rem;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 8px">
            {__l(props.lang, 'By release', 'По релизам')}
          </h3>
          <div style="overflow-x:auto;margin-bottom:16px">
            <table style="width:100%;border-collapse:collapse;font-family:var(--font-ui);font-size:0.85rem">
              <thead>
                <tr style="border-bottom:1px solid var(--ui-border)">
                  <th style="padding:6px 8px;text-align:left">{__l(props.lang, 'Release', 'Релиз')}</th>
                  {tab() === 'plays' && <>
                    <th style="padding:6px 8px;text-align:right">{__l(props.lang, 'Total', 'Всего')}</th>
                    <th style="padding:6px 8px;text-align:right">Full</th>
                    <th style="padding:6px 8px;text-align:right">Partial</th>
                    <th style="padding:6px 8px;text-align:right">Skip</th>
                    <th style="padding:6px 8px;text-align:right">{__l(props.lang, 'Tracks', 'Треков')}</th>
                  </>}
                  {tab() === 'likes' && <>
                    <th style="padding:6px 8px;text-align:right">{__l(props.lang, 'Total', 'Всего')}</th>
                    <th style="padding:6px 8px;text-align:right">{__l(props.lang, 'Album', 'Альбом')}</th>
                    <th style="padding:6px 8px;text-align:right">{__l(props.lang, 'Tracks', 'Треки')}</th>
                  </>}
                </tr>
              </thead>
              <tbody>
                <For each={data()!.summary as Record<string, unknown>[]}>{(row: Record<string, unknown>) => (
                  <tr style="border-bottom:1px solid var(--ui-border-weak)">
                    <td style="padding:5px 8px;font-weight:700">{String(row.release_slug || row.target_slug)}</td>
                    {tab() === 'plays' && <>
                      <td style="padding:5px 8px;text-align:right">{String(row.total_plays)}</td>
                      <td style="padding:5px 8px;text-align:right">{String(row.full_plays)}</td>
                      <td style="padding:5px 8px;text-align:right">{String(row.partial_plays)}</td>
                      <td style="padding:5px 8px;text-align:right">{String(row.skip_plays)}</td>
                      <td style="padding:5px 8px;text-align:right">{String(row.tracks_played)}</td>
                    </>}
                    {tab() === 'likes' && <>
                      <td style="padding:5px 8px;text-align:right">{String(row.total_likes)}</td>
                      <td style="padding:5px 8px;text-align:right">{String(row.album_likes)}</td>
                      <td style="padding:5px 8px;text-align:right">{String(row.track_likes)}</td>
                    </>}
                  </tr>
                )}</For>
              </tbody>
            </table>
          </div>
        </Show>

        <Show when={data()!.rows.length > 0}>
          <h3 style="font-family:var(--font-ui);font-size:0.9rem;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 8px">
            {__l(props.lang, 'Details', 'Подробно')}
          </h3>
          <div style="overflow-x:auto;max-height:400px;overflow-y:auto">
            <table style="width:100%;border-collapse:collapse;font-family:var(--font-ui);font-size:0.82rem">
              <thead style="position:sticky;top:0;background:var(--ui-surface)">
                <tr style="border-bottom:1px solid var(--ui-border)">
                  {tab() === 'plays' && <>
                    <th style="padding:5px 6px;text-align:left">ID</th>
                    <th style="padding:5px 6px;text-align:left">{__l(props.lang, 'Release', 'Релиз')}</th>
                    <th style="padding:5px 6px;text-align:right">{__l(props.lang, 'Track', 'Трек')}</th>
                    <th style="padding:5px 6px;text-align:left">{__l(props.lang, 'Category', 'Категория')}</th>
                    <th style="padding:5px 6px;text-align:right">{__l(props.lang, 'Date', 'Дата')}</th>
                  </>}
                  {tab() === 'likes' && <>
                    <th style="padding:5px 6px;text-align:left">ID</th>
                    <th style="padding:5px 6px;text-align:left">{__l(props.lang, 'Release', 'Релиз')}</th>
                    <th style="padding:5px 6px;text-align:left">{__l(props.lang, 'Type', 'Тип')}</th>
                    <th style="padding:5px 6px;text-align:right">{__l(props.lang, 'Track', 'Трек')}</th>
                    <th style="padding:5px 6px;text-align:right">{__l(props.lang, 'Date', 'Дата')}</th>
                  </>}
                </tr>
              </thead>
              <tbody>
                <For each={data()!.rows as Record<string, unknown>[]}>{(row: Record<string, unknown>) => (
                  <tr style="border-bottom:1px solid var(--ui-border-weak)">
                    {tab() === 'plays' && <>
                      <td style="padding:4px 6px">{String(row.id)}</td>
                      <td style="padding:4px 6px;font-weight:700">{String(row.release_slug)}</td>
                      <td style="padding:4px 6px;text-align:right">{trackName(String(row.release_slug), Number(row.track_index))}</td>
                      <td style="padding:4px 6px">{String(row.category)}</td>
                      <td style="padding:4px 6px;text-align:right;white-space:nowrap">{new Date(Number(row.created_at)).toLocaleDateString()}</td>
                    </>}
                    {tab() === 'likes' && <>
                      <td style="padding:4px 6px">{String(row.id)}</td>
                      <td style="padding:4px 6px;font-weight:700">{String(row.target_slug)}</td>
                      <td style="padding:4px 6px">{String(row.target_type)}</td>
                      <td style="padding:4px 6px;text-align:right">{row.track_index != null ? trackName(String(row.target_slug), Number(row.track_index)) : '—'}</td>
                      <td style="padding:4px 6px;text-align:right;white-space:nowrap">{new Date(Number(row.created_at)).toLocaleDateString()}</td>
                    </>}
                  </tr>
                )}</For>
              </tbody>
            </table>
          </div>
        </Show>

        <Show when={data()!.rows.length === 0 && data()!.summary.length === 0}>
          <p class="shop-empty">{__l(props.lang, 'No data', 'Нет данных')}</p>
        </Show>
      </Show>

      <Show when={mediaType() === 'video' && videoData() && !loading()}>
        <p style="font-family:var(--font-ui);font-size:0.85rem;color:var(--muted-color);margin-bottom:12px">
          {__l(props.lang, 'Total entries', 'Всего записей')}: {videoData()!.total}
        </p>
        <Show when={videoTab() === 'views' && videoData()!.summary.length > 0}>
          <h3 style="font-family:var(--font-ui);font-size:0.9rem;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 8px">
            {__l(props.lang, 'By video', 'По видео')}
          </h3>
          <div style="overflow-x:auto;margin-bottom:16px">
            <table style="width:100%;border-collapse:collapse;font-family:var(--font-ui);font-size:0.85rem">
              <thead>
                <tr style="border-bottom:1px solid var(--ui-border)">
                  <th style="padding:6px 8px;text-align:left">{__l(props.lang, 'Video', 'Видео')}</th>
                  <th style="padding:6px 8px;text-align:right">{__l(props.lang, 'Views', 'Просмотры')}</th>
                  <th style="padding:6px 8px;text-align:right">{__l(props.lang, 'Completed', 'Завершено')}</th>
                  <th style="padding:6px 8px;text-align:right">{__l(props.lang, 'Avg dur', 'Сред. длит.')}</th>
                </tr>
              </thead>
              <tbody>
                <For each={videoData()!.summary as Record<string, unknown>[]}>{(row: Record<string, unknown>) => (
                  <tr style="border-bottom:1px solid var(--ui-border-weak)">
                    <td style="padding:5px 8px;font-weight:700">{String(row.video_slug)}</td>
                    <td style="padding:5px 8px;text-align:right">{String(row.total_views)}</td>
                    <td style="padding:5px 8px;text-align:right">{String(row.completed_views)}</td>
                    <td style="padding:5px 8px;text-align:right">{Number(row.avg_duration).toFixed(1)}s</td>
                  </tr>
                )}</For>
              </tbody>
            </table>
          </div>
        </Show>
        <Show when={videoTab() === 'likes' && videoData()!.likesSummary.length > 0}>
          <h3 style="font-family:var(--font-ui);font-size:0.9rem;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 8px">
            {__l(props.lang, 'Likes by video', 'Лайки по видео')}
          </h3>
          <div style="overflow-x:auto;margin-bottom:16px">
            <table style="width:100%;border-collapse:collapse;font-family:var(--font-ui);font-size:0.85rem">
              <thead>
                <tr style="border-bottom:1px solid var(--ui-border)">
                  <th style="padding:6px 8px;text-align:left">{__l(props.lang, 'Video', 'Видео')}</th>
                  <th style="padding:6px 8px;text-align:right">{__l(props.lang, 'Likes', 'Лайки')}</th>
                </tr>
              </thead>
              <tbody>
                <For each={videoData()!.likesSummary as Record<string, unknown>[]}>{(row: Record<string, unknown>) => (
                  <tr style="border-bottom:1px solid var(--ui-border-weak)">
                    <td style="padding:5px 8px;font-weight:700">{String(row.target_slug)}</td>
                    <td style="padding:5px 8px;text-align:right">{String(row.total_likes)}</td>
                  </tr>
                )}</For>
              </tbody>
            </table>
          </div>
        </Show>
        <Show when={videoData()!.rows.length > 0 && videoTab() === 'views'}>
          <h3 style="font-family:var(--font-ui);font-size:0.9rem;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 8px">
            {__l(props.lang, 'Details', 'Подробно')}
          </h3>
          <div style="overflow-x:auto;max-height:400px;overflow-y:auto">
            <table style="width:100%;border-collapse:collapse;font-family:var(--font-ui);font-size:0.82rem">
              <thead style="position:sticky;top:0;background:var(--ui-surface)">
                <tr style="border-bottom:1px solid var(--ui-border)">
                  <th style="padding:5px 6px;text-align:left">ID</th>
                  <th style="padding:5px 6px;text-align:left">{__l(props.lang, 'Video', 'Видео')}</th>
                  <th style="padding:5px 6px;text-align:right">{__l(props.lang, 'Duration', 'Длит.')}</th>
                  <th style="padding:5px 6px;text-align:left">{__l(props.lang, 'Completed', 'Завершено')}</th>
                  <th style="padding:5px 6px;text-align:right">{__l(props.lang, 'Date', 'Дата')}</th>
                </tr>
              </thead>
              <tbody>
                <For each={videoData()!.rows as Record<string, unknown>[]}>{(row: Record<string, unknown>) => (
                  <tr style="border-bottom:1px solid var(--ui-border-weak)">
                    <td style="padding:4px 6px">{String(row.id)}</td>
                    <td style="padding:4px 6px;font-weight:700">{String(row.video_slug)}</td>
                    <td style="padding:4px 6px;text-align:right">{Number(row.duration_watched).toFixed(1)}s</td>
                    <td style="padding:4px 6px">{Number(row.completed) ? '✓' : '—'}</td>
                    <td style="padding:4px 6px;text-align:right;white-space:nowrap">{new Date(Number(row.created_at)).toLocaleDateString()}</td>
                  </tr>
                )}</For>
              </tbody>
            </table>
          </div>
        </Show>
        <Show when={videoData()!.rows.length === 0 && videoData()!.summary.length === 0 && videoData()!.likesSummary.length === 0}>
          <p class="shop-empty">{__l(props.lang, 'No data', 'Нет данных')}</p>
        </Show>
      </Show>
    </section>
  )
}
