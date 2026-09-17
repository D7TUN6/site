import { For, Show, createSignal } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { Lang } from '@/types/content'
import type { AdminBanner } from '@/lib/api/admin'
import { UiSelect } from '@/components/ui-select'
import type { UiSelectOption } from '@/components/ui-select'
import { getLocaleDictionarySync } from '@/lib/i18n'

function __l(lang: string, en: string, ru: string): string { return lang === 'ru' ? ru : en }
function _al(lang: string, key: string, en: string, ru: string): string { return (getLocaleDictionarySync(lang as 'en' | 'ru')?.admin as Record<string, string>)?.[key] || (lang === 'ru' ? ru : en) }

const PAGES_WITH_BANNERS = ['shop', 'music', 'main', 'bio', 'donate', 'news', 'blog', 'gallery', 'video', 'radio']
const PAGE_BANNER_OPTIONS: UiSelectOption[] = PAGES_WITH_BANNERS.map((p) => ({ value: p, label: p }))

export function AdminBannersPanel(props: { lang: Lang; banners: Accessor<AdminBanner[]>; createBanner: (d: { page: string; text: string; active?: boolean }) => Promise<{ ok: boolean; id: number }>; updateBanner: (id: number, d: { text?: string; active?: boolean; page?: string }) => Promise<{ ok: boolean }>; deleteBanner: (id: number) => Promise<{ ok: boolean }>; reload: () => void }) {
  const [newPage, setNewPage] = createSignal('shop')
  const [newText, setNewText] = createSignal('')
  const [newActive, setNewActive] = createSignal(true)
  const [editId, setEditId] = createSignal<number | null>(null)
  const [editText, setEditText] = createSignal('')
  const [editPage, setEditPage] = createSignal('')
  const [saving, setSaving] = createSignal(false)
  const [errorMsg, setErrorMsg] = createSignal<string | null>(null)

  const handleCreate = async () => {
    if (!newText().trim()) return
    try { await props.createBanner({ page: newPage(), text: newText().trim(), active: newActive() }); setNewText(''); props.reload() }
    catch (err) { setErrorMsg(err instanceof Error ? err.message : 'Create failed') }
  }

  const startEdit = (banner: AdminBanner) => {
    setEditId(banner.id)
    setEditText(banner.text)
    setEditPage(banner.page)
  }

  const cancelEdit = () => {
    setEditId(null)
    setEditText('')
    setEditPage('')
  }

  const saveEdit = async () => {
    const id = editId()
    if (id == null || !editText().trim()) return
    setSaving(true)
    try {
      await props.updateBanner(id, { text: editText().trim(), page: editPage() })
      cancelEdit()
      props.reload()
    } catch (err) { setErrorMsg(err instanceof Error ? err.message : 'Save failed') }
    finally { setSaving(false) }
  }

  const toggleBanner = async (banner: AdminBanner) => {
    try { await props.updateBanner(banner.id, { active: !banner.active }); props.reload() }
    catch (err) { setErrorMsg(err instanceof Error ? err.message : 'Toggle failed') }
  }

  const handleDelete = async (id: number) => {
    try { await props.deleteBanner(id); props.reload() }
    catch (err) { setErrorMsg(err instanceof Error ? err.message : 'Delete failed') }
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
        <h3>{__l(props.lang, 'new banner', 'новый баннер')}</h3>
        <label class="form-field"><span class="form-label">{__l(props.lang, 'page', 'страница')}</span>
          <UiSelect modelValue={newPage()} options={PAGE_BANNER_OPTIONS} onChange={(v) => setNewPage(v)} ariaLabel="Page" />
        </label>
        <label class="form-field form-field-full"><span class="form-label">{__l(props.lang, 'text', 'текст')}</span><textarea class="form-textarea" rows="3" value={newText()} onInput={(e) => setNewText(e.currentTarget.value)} placeholder="HTML supported. Use &lt;a href=&quot;...&quot; target=&quot;_blank&quot;&gt; for links." /></label>
        <div class="auth-actions">
          <button class={`shop-btn ${newActive() ? 'is-active' : 'shop-btn-secondary'}`} onClick={() => setNewActive(!newActive())}>
            {newActive() ? (__l(props.lang, 'active', 'активен')) : (__l(props.lang, 'inactive', 'неактивен'))}
          </button>
        </div>
        <div class="auth-actions"><button class="shop-btn" onClick={handleCreate} disabled={!newText().trim()}>{__l(props.lang, 'create', 'создать')}</button></div>
      </div>
      <Show when={props.banners().length > 0}>
        <h3>{_al(props.lang, 'banners', 'banners', 'баннеры')} ({props.banners().length})</h3>
        <For each={props.banners()}>
          {(banner) => (
            <div class="admin-order-card">
              <div class="order-card-top"><h2>{banner.page}</h2><span class={`shop-status-badge ${banner.active ? 'shop-status-available' : 'shop-status-sold_out'}`}>{banner.active ? 'active' : 'inactive'}</span></div>
              <Show
                when={editId() === banner.id}
                fallback={<p>{banner.text}</p>}
              >
                <div class="auth-form" style="margin-top: 6px;">
                  <label class="form-field"><span class="form-label">{__l(props.lang, 'page', 'страница')}</span>
                    <UiSelect modelValue={editPage()} options={PAGE_BANNER_OPTIONS} onChange={(v) => setEditPage(v)} ariaLabel="Edit page" />
                  </label>
                  <label class="form-field form-field-full"><span class="form-label">{__l(props.lang, 'text', 'текст')}</span>
                    <textarea class="form-textarea" rows="3" value={editText()} onInput={(e) => setEditText(e.currentTarget.value)} />
                  </label>
                  <div class="auth-actions">
                    <button class="shop-btn" onClick={saveEdit} disabled={saving() || !editText().trim()}>{__l(props.lang, 'save', 'сохранить')}</button>
                    <button class="shop-btn shop-btn-secondary" onClick={cancelEdit}>{__l(props.lang, 'cancel', 'отмена')}</button>
                  </div>
                </div>
              </Show>
              <div class="auth-actions">
                <Show when={editId() !== banner.id}>
                  <button class="shop-btn" onClick={() => startEdit(banner)}>{__l(props.lang, 'edit', 'редактировать')}</button>
                  <button class="shop-btn" onClick={() => toggleBanner(banner)}>{banner.active ? (__l(props.lang, 'deactivate', 'отключить')) : (__l(props.lang, 'activate', 'включить'))}</button>
                  <button class="shop-btn shop-btn-secondary" onClick={() => handleDelete(banner.id)}>{__l(props.lang, 'delete', 'удалить')}</button>
                </Show>
              </div>
            </div>
          )}
        </For>
      </Show>
    </section>
  )
}
