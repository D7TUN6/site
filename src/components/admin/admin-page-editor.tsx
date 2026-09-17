import { Show, createEffect, createSignal } from 'solid-js'
import type { Lang } from '@/types/content'
import { getAdminContentPage, updateAdminContentPage } from '@/lib/api/admin-content'


function __l(lang: string, en: string, ru: string): string { return lang === 'ru' ? ru : en }

export function AdminPageEditor(props: { lang: Lang; pageKey: string; pageLabel: string }) {
  const [enContent, setEnContent] = createSignal('')
  const [ruContent, setRuContent] = createSignal('')
  const [loading, setLoading] = createSignal(true)
  const [saving, setSaving] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [lang, setLang] = createSignal<'en' | 'ru'>('en')

  const load = async () => {
    setLoading(true)
    try {
      const data = await getAdminContentPage(props.pageKey)
      setEnContent(data.en?.content || '')
      setRuContent(data.ru?.content || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    }
    setLoading(false)
  }

  createEffect(() => { load() })

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateAdminContentPage(props.pageKey, { en: { content: enContent() }, ru: { content: ruContent() } })
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    }
    setSaving(false)
  }

  return (
    <section class="admin-orders">
      <Show when={error()}>
        <div class="confirm-overlay" onClick={() => setError(null)}>
          <div class="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p class="confirm-text">{error()}</p>
            <div class="confirm-actions">
              <button class="shop-btn" onClick={() => setError(null)}>{__l(props.lang, 'ok', 'ок')}</button>
            </div>
          </div>
        </div>
      </Show>

      <h3>{props.pageLabel}</h3>

      <Show when={loading()}>
        <div class="release-download-spinner" style="margin:24px auto" />
      </Show>

      <Show when={!loading()}>
        <div class="auth-form">
          <div class="auth-actions" style="margin-bottom:8px">
            <button type="button" class={`shop-btn ${lang() === 'en' ? 'is-active' : 'shop-btn-secondary'}`} onClick={() => setLang('en')}>EN</button>
            <button type="button" class={`shop-btn ${lang() === 'ru' ? 'is-active' : 'shop-btn-secondary'}`} onClick={() => setLang('ru')}>RU</button>
          </div>
          <Show when={lang() === 'en'}>
            <label class="form-field form-field-full">
              <span class="form-label">EN {__l(props.lang, 'content (MDX)', 'содержание (MDX)')}</span>
              <textarea class="form-textarea" rows="16" value={enContent()} onInput={(e) => setEnContent(e.currentTarget.value)} />
            </label>
          </Show>
          <Show when={lang() === 'ru'}>
            <label class="form-field form-field-full">
              <span class="form-label">RU {__l(props.lang, 'content (MDX)', 'содержание (MDX)')}</span>
              <textarea class="form-textarea" rows="16" value={ruContent()} onInput={(e) => setRuContent(e.currentTarget.value)} />
            </label>
          </Show>
          <div class="auth-actions">
            <button class="shop-btn" onClick={handleSave} disabled={saving()}>{saving() ? '...' : (__l(props.lang, 'save', 'сохранить'))}</button>
          </div>
        </div>
      </Show>
    </section>
  )
}
