import { For, Show, createEffect, createSignal } from 'solid-js'
import type { Lang } from '@/types/content'
import type { AdminArtist } from '@/lib/api/admin'

function __l(lang: string, en: string, ru: string): string { return lang === 'ru' ? ru : en }

export function AdminArtistsPanel(props: {
  lang: Lang
  getArtists: () => Promise<{ ok: boolean; artists: AdminArtist[] }>
  verifyArtist: (id: number, verified: boolean) => Promise<{ ok: boolean; verified: boolean }>
}) {
  const [artists, setArtists] = createSignal<AdminArtist[]>([])
  const [loading, setLoading] = createSignal(false)
  const [errorMsg, setErrorMsg] = createSignal<string | null>(null)

  const loadArtists = async () => {
    setLoading(true)
    try {
      const data = await props.getArtists()
      setArtists(data.artists)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load artists')
    }
    setLoading(false)
  }

  const toggleVerify = async (id: number, current: number) => {
    try {
      await props.verifyArtist(id, !current)
      await loadArtists()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to toggle verification')
    }
  }

  createEffect(() => { loadArtists() })

  return (
    <section class="admin-orders">
      <Show when={errorMsg()}>
        <div class="confirm-overlay" role="dialog" aria-modal="true" aria-label={__l(props.lang, 'Error', 'Ошибка')} onClick={() => setErrorMsg(null)}>
          <div class="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p class="confirm-text" role="alert">{errorMsg()}</p>
            <div class="confirm-actions">
              <button class="shop-btn" onClick={() => setErrorMsg(null)}>{__l(props.lang, 'ok', 'ок')}</button>
            </div>
          </div>
        </div>
      </Show>
      <Show when={!loading() || artists().length > 0} fallback={<p class="shop-empty">{__l(props.lang, 'loading...', 'загрузка...')}</p>}>
        <Show when={artists().length > 0} fallback={<p class="shop-empty">{__l(props.lang, 'no artists', 'нет артистов')}</p>}>
          <For each={artists()}>
            {(artist) => (
              <div class="admin-order-card">
                <div class="order-card-top">
                  <h2>
                    {artist.name}
                    <Show when={artist.verified}>
                      <span class="verified-badge" title={__l(props.lang, 'verified', 'верифицирован')}>✓</span>
                    </Show>
                  </h2>
                  <span class={`order-status ${artist.status === 'approved' ? 'shop-status-available' : artist.status === 'rejected' ? 'shop-status-sold_out' : ''}`}>
                    {artist.status}
                  </span>
                </div>
                <div class="order-card-meta">
                  <span>slug: {artist.slug}</span>
                  <Show when={artist.userId}>
                    <span>user id: {artist.userId}</span>
                  </Show>
                </div>
                <div class="auth-actions">
                  <button class={`shop-btn ${artist.verified ? 'is-active' : 'shop-btn-secondary'}`} onClick={() => toggleVerify(artist.id, artist.verified)}>
                    {artist.verified ? (__l(props.lang, 'verified', 'верифицирован')) : (__l(props.lang, 'verify', 'верифицировать'))}
                  </button>
                </div>
              </div>
            )}
          </For>
        </Show>
      </Show>
    </section>
  )
}
