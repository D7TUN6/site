import { For, Show, createEffect, createMemo, createSignal } from 'solid-js'
import type { Lang } from '@/types/content'
import { getAdminContentList, getAdminContentArticle, createAdminContentArticle, updateAdminContentArticle, deleteAdminContentArticle, type AdminContentArticle } from '@/lib/api/admin-content'

function __l(lang: string, en: string, ru: string): string { return lang === 'ru' ? ru : en }

export function AdminArticleManager(props: { lang: Lang; type: 'news' | 'blog' }) {
  const [articles, setArticles] = createSignal<{ en: AdminContentArticle[]; ru: AdminContentArticle[] }>({ en: [], ru: [] })
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string | null>(null)
  const [editSlug, setEditSlug] = createSignal<string | null>(null)
  const [editLang, setEditLang] = createSignal<'en' | 'ru'>('en')
  const [newOpen, setNewOpen] = createSignal(false)
  const [newLang, setNewLang] = createSignal<'en' | 'ru'>('en')

  const [newSlug, setNewSlug] = createSignal('')
  const [newEnTitle, setNewEnTitle] = createSignal('')
  const [newRuTitle, setNewRuTitle] = createSignal('')
  const [newEnExcerpt, setNewEnExcerpt] = createSignal('')
  const [newRuExcerpt, setNewRuExcerpt] = createSignal('')
  const [newPublishedAt, setNewPublishedAt] = createSignal('')
  const [newEnContent, setNewEnContent] = createSignal('')
  const [newRuContent, setNewRuContent] = createSignal('')

  const [editEnTitle, setEditEnTitle] = createSignal('')
  const [editRuTitle, setEditRuTitle] = createSignal('')
  const [editEnExcerpt, setEditEnExcerpt] = createSignal('')
  const [editRuExcerpt, setEditRuExcerpt] = createSignal('')
  const [editEnPublishedAt, setEditEnPublishedAt] = createSignal('')
  const [editRuPublishedAt, setEditRuPublishedAt] = createSignal('')
  const [editEnContent, setEditEnContent] = createSignal('')
  const [editRuContent, setEditRuContent] = createSignal('')

  const [creating, setCreating] = createSignal(false)
  const [confirmDelete, setConfirmDelete] = createSignal<string | null>(null)

  const loadArticles = async () => {
    setLoading(true)
    try {
      const data = await getAdminContentList(props.type)
      setArticles(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    }
    setLoading(false)
  }

  createEffect(() => { loadArticles() })

  const merged = createMemo(() => {
    const enMap = new Map(articles().en.map((a) => [a.slug, a]))
    const ruMap = new Map(articles().ru.map((a) => [a.slug, a]))
    const allSlugs = new Set([...enMap.keys(), ...ruMap.keys()])
    return Array.from(allSlugs).sort((a, b) => {
      const aDate = enMap.get(a)?.publishedAt || ruMap.get(a)?.publishedAt || ''
      const bDate = enMap.get(b)?.publishedAt || ruMap.get(b)?.publishedAt || ''
      return bDate.localeCompare(aDate)
    })
  })

  const handleCreate = async () => {
    const slug = newSlug().trim()
    if (!slug) return
    setCreating(true)
    try {
      await createAdminContentArticle(props.type, {
        en: { slug, title: newEnTitle().trim() || slug, excerpt: newEnExcerpt().trim() || undefined, publishedAt: newPublishedAt().trim() || undefined, content: newEnContent() },
        ru: { slug, title: newRuTitle().trim() || slug, excerpt: newRuExcerpt().trim() || undefined, publishedAt: newPublishedAt().trim() || undefined, content: newRuContent() },
      })
      setNewOpen(false)
      setNewSlug(''); setNewEnTitle(''); setNewRuTitle(''); setNewEnExcerpt(''); setNewRuExcerpt(''); setNewPublishedAt(''); setNewEnContent(''); setNewRuContent('')
      await loadArticles()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed')
    }
    setCreating(false)
  }

  const openEditor = async (slug: string) => {
    try {
      const data = await getAdminContentArticle(props.type, slug)
      setEditSlug(slug)
      setEditEnTitle(data.en?.title || slug)
      setEditRuTitle(data.ru?.title || slug)
      setEditEnExcerpt(data.en?.excerpt || '')
      setEditRuExcerpt(data.ru?.excerpt || '')
      setEditEnPublishedAt(data.en?.publishedAt || '')
      setEditRuPublishedAt(data.ru?.publishedAt || '')
      setEditEnContent(data.en?.content || '')
      setEditRuContent(data.ru?.content || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load article')
    }
  }

  const handleSave = async (slug: string) => {
    try {
      await updateAdminContentArticle(props.type, slug, {
        en: { title: editEnTitle(), excerpt: editEnExcerpt(), publishedAt: editEnPublishedAt(), content: editEnContent() },
        ru: { title: editRuTitle(), excerpt: editRuExcerpt(), publishedAt: editRuPublishedAt(), content: editRuContent() },
      })
      setEditSlug(null)
      await loadArticles()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    }
  }

  const handleDelete = async (slug: string) => {
    try {
      await deleteAdminContentArticle(props.type, slug)
      setConfirmDelete(null)
      setEditSlug(null)
      await loadArticles()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
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

      <Show when={confirmDelete()}>
        <div class="confirm-overlay" onClick={() => setConfirmDelete(null)}>
          <div class="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p class="confirm-text">{__l(props.lang, `Delete "${confirmDelete()}"?`, `Удалить «${confirmDelete()}»?`)}</p>
            <div class="confirm-actions">
              <button class="shop-btn shop-btn-danger" onClick={() => handleDelete(confirmDelete()!)}>{__l(props.lang, 'delete', 'удалить')}</button>
              <button class="shop-btn shop-btn-secondary" onClick={() => setConfirmDelete(null)}>{__l(props.lang, 'cancel', 'отмена')}</button>
            </div>
          </div>
        </div>
      </Show>

      <div class="auth-actions">
        <button class="shop-btn" onClick={() => setNewOpen((v) => !v)}>
          {newOpen() ? (__l(props.lang, 'cancel', 'отмена')) : (__l(props.lang, 'new article', 'новая статья'))}
        </button>
      </div>

      <Show when={newOpen()}>
        <div class="auth-form">
          <h3>{__l(props.lang, 'new article', 'новая статья')}</h3>
          <label class="form-field"><span class="form-label">slug</span><input class="form-input" value={newSlug()} onInput={(e) => setNewSlug(e.currentTarget.value)} placeholder="my-article-slug" /></label>
          <label class="form-field"><span class="form-label">date</span><input class="form-input" value={newPublishedAt()} onInput={(e) => setNewPublishedAt(e.currentTarget.value)} placeholder="2026-01-01" /></label>
          <div class="auth-actions" style="margin-bottom:6px">
            <button type="button" class={`shop-btn ${newLang() === 'en' ? 'is-active' : 'shop-btn-secondary'}`} onClick={() => setNewLang('en')}>EN</button>
            <button type="button" class={`shop-btn ${newLang() === 'ru' ? 'is-active' : 'shop-btn-secondary'}`} onClick={() => setNewLang('ru')}>RU</button>
          </div>
          <Show when={newLang() === 'en'}>
            <label class="form-field"><span class="form-label">{__l(props.lang, 'title', 'заголовок')}</span><input class="form-input" value={newEnTitle()} onInput={(e) => setNewEnTitle(e.currentTarget.value)} /></label>
            <label class="form-field"><span class="form-label">excerpt</span><input class="form-input" value={newEnExcerpt()} onInput={(e) => setNewEnExcerpt(e.currentTarget.value)} /></label>
            <label class="form-field form-field-full"><span class="form-label">{__l(props.lang, 'content', 'содержание')}</span><textarea class="form-textarea" rows="6" value={newEnContent()} onInput={(e) => setNewEnContent(e.currentTarget.value)} /></label>
          </Show>
          <Show when={newLang() === 'ru'}>
            <label class="form-field"><span class="form-label">{__l(props.lang, 'title', 'заголовок')}</span><input class="form-input" value={newRuTitle()} onInput={(e) => setNewRuTitle(e.currentTarget.value)} /></label>
            <label class="form-field"><span class="form-label">excerpt</span><input class="form-input" value={newRuExcerpt()} onInput={(e) => setNewRuExcerpt(e.currentTarget.value)} /></label>
            <label class="form-field form-field-full"><span class="form-label">{__l(props.lang, 'content', 'содержание')}</span><textarea class="form-textarea" rows="6" value={newRuContent()} onInput={(e) => setNewRuContent(e.currentTarget.value)} /></label>
          </Show>
          <div class="auth-actions">
            <button class="shop-btn" onClick={handleCreate} disabled={!newSlug().trim() || creating()}>{creating() ? '...' : (__l(props.lang, 'create', 'создать'))}</button>
          </div>
        </div>
      </Show>

      <Show when={loading()}>
        <div class="release-download-spinner" style="margin:19px auto" />
      </Show>

      <Show when={!loading() && merged().length === 0}>
        <p class="shop-empty">{__l(props.lang, 'no articles', 'нет статей')}</p>
      </Show>

      <For each={merged()}>
        {(slug) => {
          const en = articles().en.find((a) => a.slug === slug)
          const ru = articles().ru.find((a) => a.slug === slug)
          const title = en?.title || ru?.title || slug
          const publishedAt = en?.publishedAt || ru?.publishedAt || ''
          const excerpt = en?.excerpt || ru?.excerpt || ''
          return (
            <div class="admin-order-card">
              <div class="order-card-top">
                <h2>{title}</h2>
                <span class="order-status">{publishedAt}</span>
              </div>
              <Show when={excerpt}>
                <p style="font-family:var(--font-ui);font-size:0.85rem;color:var(--muted-color);margin:3px 0 0">{excerpt}</p>
              </Show>
              <Show when={editSlug() === slug} fallback={(
                <div class="auth-actions">
                  <button class="shop-btn" onClick={() => openEditor(slug)}>{__l(props.lang, 'edit', 'ред.')}</button>
                  <button class="shop-btn shop-btn-secondary" onClick={() => setConfirmDelete(slug)}>{__l(props.lang, 'delete', 'удалить')}</button>
                </div>
              )}>
                <div class="auth-form">
                  <div class="auth-actions" style="margin-bottom:6px">
                    <button type="button" class={`shop-btn ${editLang() === 'en' ? 'is-active' : 'shop-btn-secondary'}`} onClick={() => setEditLang('en')}>EN</button>
                    <button type="button" class={`shop-btn ${editLang() === 'ru' ? 'is-active' : 'shop-btn-secondary'}`} onClick={() => setEditLang('ru')}>RU</button>
                  </div>
                  <Show when={editLang() === 'en'}>
                    <label class="form-field"><span class="form-label">{__l(props.lang, 'title', 'заголовок')}</span><input class="form-input" value={editEnTitle()} onInput={(e) => setEditEnTitle(e.currentTarget.value)} /></label>
                    <label class="form-field"><span class="form-label">excerpt</span><input class="form-input" value={editEnExcerpt()} onInput={(e) => setEditEnExcerpt(e.currentTarget.value)} /></label>
                    <label class="form-field"><span class="form-label">date</span><input class="form-input" value={editEnPublishedAt()} onInput={(e) => setEditEnPublishedAt(e.currentTarget.value)} placeholder="2026-01-01" /></label>
                    <label class="form-field form-field-full"><span class="form-label">{__l(props.lang, 'content', 'содержание')}</span><textarea class="form-textarea" rows="8" value={editEnContent()} onInput={(e) => setEditEnContent(e.currentTarget.value)} /></label>
                  </Show>
                  <Show when={editLang() === 'ru'}>
                    <label class="form-field"><span class="form-label">{__l(props.lang, 'title', 'заголовок')}</span><input class="form-input" value={editRuTitle()} onInput={(e) => setEditRuTitle(e.currentTarget.value)} /></label>
                    <label class="form-field"><span class="form-label">excerpt</span><input class="form-input" value={editRuExcerpt()} onInput={(e) => setEditRuExcerpt(e.currentTarget.value)} /></label>
                    <label class="form-field"><span class="form-label">date</span><input class="form-input" value={editRuPublishedAt()} onInput={(e) => setEditRuPublishedAt(e.currentTarget.value)} placeholder="2026-01-01" /></label>
                    <label class="form-field form-field-full"><span class="form-label">{__l(props.lang, 'content', 'содержание')}</span><textarea class="form-textarea" rows="8" value={editRuContent()} onInput={(e) => setEditRuContent(e.currentTarget.value)} /></label>
                  </Show>
                  <div class="auth-actions">
                    <button class="shop-btn" onClick={() => handleSave(slug)}>{__l(props.lang, 'save', 'сохранить')}</button>
                    <button class="shop-btn shop-btn-secondary" onClick={() => setEditSlug(null)}>{__l(props.lang, 'cancel', 'отмена')}</button>
                  </div>
                </div>
              </Show>
            </div>
          )
        }}
      </For>
    </section>
  )
}
