import { For, Show, createEffect, createSignal } from 'solid-js'
import type { Lang } from '@/types/content'
import type { Accessor } from 'solid-js'

function __l(lang: string, en: string, ru: string): string { return lang === 'ru' ? ru : en }

const ALL_FEATURES: Record<string, string> = {
  releases: 'Music / Releases',
  gallery: 'Gallery',
  video: 'Video',
  radio: 'Radio',
  shop: 'Shop',
  cart: 'Cart / Checkout',
  orders: 'Orders',
  donate: 'Donate',
  account: 'Account',
  registration: 'Registration',
  news: 'News',
  blog: 'Blog',
  projects: 'Projects',
}

export function AdminSiteConfigPanel(props: { lang: Lang; config: Accessor<Record<string, string | boolean>>; updateConfig: (c: Record<string, string | boolean>) => Promise<void> }) {
  const [localConfig, setLocalConfig] = createSignal<Record<string, string | boolean>>({})
  const [saving, setSaving] = createSignal(false)
  const [errorMsg, setErrorMsg] = createSignal<string | null>(null)

  createEffect(() => {
    setLocalConfig({ ...props.config() })
  })

  const toggleFeature = (key: string) => {
    setLocalConfig((prev) => {
      const current = prev[`feature_${key}`] !== false
      return { ...prev, [`feature_${key}`]: !current }
    })
  }

  const save = async () => {
    setSaving(true)
    try { await props.updateConfig(localConfig()); setSaving(false) }
    catch (err) { setSaving(false); setErrorMsg(err instanceof Error ? err.message : 'Save failed') }
  }

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
      <div class="auth-form">
        <h3>{__l(props.lang, 'section management', 'управление разделами')}</h3>
        <p class="checkout-hint">{__l(props.lang, 'Disabling a section blocks its API and shows a disabled page', 'Отключение раздела блокирует API и отображает страницу «Раздел отключён»')}</p>
        <For each={Object.entries(ALL_FEATURES)}>
          {([key, label]) => (
            <div class="storage-file-item">
              <span class="storage-file-name">{label}</span>
              <button class={`shop-btn ${localConfig()[`feature_${key}`] !== false ? 'is-active' : 'shop-btn-secondary'}`} onClick={() => toggleFeature(key)}>
                {localConfig()[`feature_${key}`] !== false ? (__l(props.lang, 'on', 'вкл')) : (__l(props.lang, 'off', 'выкл'))}
              </button>
            </div>
          )}
        </For>
        <div class="auth-actions"><button class="shop-btn" onClick={save} disabled={saving()}>{saving() ? '...' : (__l(props.lang, 'save', 'сохранить'))}</button></div>
      </div>
    </section>
  )
}
