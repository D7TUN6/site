import { For, Show, createEffect, createSignal } from 'solid-js'
import type { Lang } from '@/types/content'
import { getAdminArtistApplications, getAdminPendingContent, reviewAdminArtistApplication, reviewAdminContent, type AdminArtistApplication, type AdminContentItem } from '@/lib/api/admin'

function __l(lang: string, en: string, ru: string): string { return lang === 'ru' ? ru : en }

export function AdminArtistModeration(props: { lang: Lang }) {
  const [applications, setApplications] = createSignal<AdminArtistApplication[]>([])
  const [pendingContent, setPendingContent] = createSignal<AdminContentItem[]>([])
  const [appLoading, setAppLoading] = createSignal(false)
  const [contentLoading, setContentLoading] = createSignal(false)
  const [errorMsg, setErrorMsg] = createSignal<string | null>(null)
  const [appFeedback, setAppFeedback] = createSignal('')
  const [contentFeedback, setContentFeedback] = createSignal('')
  const [reviewAppId, setReviewAppId] = createSignal<number | null>(null)
  const [reviewContentId, setReviewContentId] = createSignal<number | null>(null)

  const load = async () => {
    setAppLoading(true)
    setContentLoading(true)
    try {
      const [m, c] = await Promise.all([
        getAdminArtistApplications(),
        getAdminPendingContent(),
      ])
      if (m.ok) setApplications(m.applications)
      if (c.ok) setPendingContent(c.items)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'load failed')
    }
    setAppLoading(false)
    setContentLoading(false)
  }

  createEffect(() => { load() })

  const reviewApp = async (id: number, status: 'approved' | 'rejected' | 'sent_back') => {
    try {
      await reviewAdminArtistApplication(id, { status, feedback: appFeedback().trim() || undefined })
      setReviewAppId(null)
      setAppFeedback('')
      await load()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'review failed')
    }
  }

  const reviewContent = async (id: number, status: 'approved' | 'rejected') => {
    try {
      await reviewAdminContent(id, { status, feedback: contentFeedback().trim() || undefined })
      setReviewContentId(null)
      setContentFeedback('')
      await load()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'review failed')
    }
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

      <h2 style="font-family:var(--font-display);font-size:1rem;font-weight:900;letter-spacing:0.12em;text-transform:uppercase;margin:0 0 12px">{__l(props.lang, 'artist applications', 'заявки артистов')}</h2>
      <Show when={appLoading() && applications().length === 0} fallback={
        <Show when={applications().length === 0}>
          <p class="shop-empty">{__l(props.lang, 'no applications', 'нет заявок')}</p>
        </Show>
      }>
        <div class="release-download-spinner" style="margin:12px auto" />
      </Show>
      <For each={applications()}>
        {(app) => (
          <div class="admin-order-card">
            <div class="order-card-top">
              <h2>{app.name}</h2>
              <span class={`order-status ${app.status === 'approved' ? 'shop-status-available' : app.status === 'rejected' ? 'shop-status-sold_out' : ''}`}>{app.status}</span>
            </div>
            <div class="order-card-meta">
              <span>{app.userEmail || `user #${app.userId}`}</span>
              <span>{new Date(app.createdAt).toLocaleDateString()}</span>
            </div>
            <Show when={app.bio}>
              <p class="support-ticket-message">{app.bio}</p>
            </Show>
            <Show when={app.links}>
              <div class="order-card-meta">{__l(props.lang, 'links:', 'ссылки:')} {app.links}</div>
            </Show>
            <Show when={app.feedback}>
              <div style="font-family:var(--font-ui);font-size:0.85rem;margin:4px 0;padding:6px 8px;border-left:3px solid var(--accent-hot);background:var(--ui-surface-2);border-radius:2px">
                <strong>{__l(props.lang, 'feedback:', 'отзыв:')}</strong> {app.feedback}
              </div>
            </Show>
            <Show when={reviewAppId() === app.id}>
              <div class="auth-form">
                <label class="form-field form-field-full">
                  <span class="form-label">{__l(props.lang, 'feedback', 'отзыв')}</span>
                  <textarea class="form-textarea" rows="3" value={appFeedback()} onInput={(e) => setAppFeedback(e.currentTarget.value)} placeholder={__l(props.lang, 'reason (optional)', 'причина (опционально)')} />
                </label>
                <div class="auth-actions">
                  <button class="shop-btn" onClick={() => reviewApp(app.id, 'approved')}>{__l(props.lang, 'approve', 'одобрить')}</button>
                  <button class="shop-btn shop-btn-secondary" onClick={() => reviewApp(app.id, 'sent_back')}>{__l(props.lang, 'send back', 'на доработку')}</button>
                  <button class="shop-btn shop-btn-secondary" style="background:rgba(220,38,38,0.14);border-color:rgba(220,38,38,0.42);color:rgb(248,113,113)" onClick={() => reviewApp(app.id, 'rejected')}>{__l(props.lang, 'reject', 'отклонить')}</button>
                  <button class="shop-btn shop-btn-secondary" onClick={() => { setReviewAppId(null); setAppFeedback('') }}>{__l(props.lang, 'cancel', 'отмена')}</button>
                </div>
              </div>
            </Show>
            <Show when={app.status === 'pending' && reviewAppId() !== app.id}>
              <div class="auth-actions">
                <button class="shop-btn" onClick={() => setReviewAppId(app.id)}>{__l(props.lang, 'review', 'рассмотреть')}</button>
              </div>
            </Show>
          </div>
        )}
      </For>

      <h2 style="font-family:var(--font-display);font-size:1rem;font-weight:900;letter-spacing:0.12em;text-transform:uppercase;margin:20px 0 12px">{__l(props.lang, 'pending content', 'контент на модерации')}</h2>
      <Show when={contentLoading() && pendingContent().length === 0} fallback={
        <Show when={pendingContent().length === 0}>
          <p class="shop-empty">{__l(props.lang, 'no content', 'нет контента')}</p>
        </Show>
      }>
        <div class="release-download-spinner" style="margin:12px auto" />
      </Show>
      <For each={pendingContent()}>
        {(item) => (
          <div class="admin-order-card">
            <div class="order-card-top">
              <h2>{item.title}</h2>
              <span class="order-status">{item.status}</span>
            </div>
            <div class="order-card-meta">
              <span>{item.artistName}</span>
              <span>{item.type}</span>
              <span>{new Date(item.createdAt).toLocaleDateString()}</span>
            </div>
            <Show when={item.description}>
              <p class="support-ticket-message">{item.description}</p>
            </Show>
            <Show when={item.fileUrl}>
              <div class="order-card-meta"><a href={item.fileUrl} target="_blank" rel="noopener noreferrer">{__l(props.lang, 'file', 'файл')}</a></div>
            </Show>
            <Show when={item.feedback}>
              <div style="font-family:var(--font-ui);font-size:0.85rem;margin:4px 0;padding:6px 8px;border-left:3px solid var(--accent-hot);background:var(--ui-surface-2);border-radius:2px">
                <strong>{__l(props.lang, 'feedback:', 'отзыв:')}</strong> {item.feedback}
              </div>
            </Show>
            <Show when={reviewContentId() === item.id}>
              <div class="auth-form">
                <label class="form-field form-field-full">
                  <span class="form-label">{__l(props.lang, 'feedback', 'отзыв')}</span>
                  <textarea class="form-textarea" rows="3" value={contentFeedback()} onInput={(e) => setContentFeedback(e.currentTarget.value)} placeholder={__l(props.lang, 'reason (optional)', 'причина (опционально)')} />
                </label>
                <div class="auth-actions">
                  <button class="shop-btn" onClick={() => reviewContent(item.id, 'approved')}>{__l(props.lang, 'approve', 'одобрить')}</button>
                  <button class="shop-btn shop-btn-secondary" style="background:rgba(220,38,38,0.14);border-color:rgba(220,38,38,0.42);color:rgb(248,113,113)" onClick={() => reviewContent(item.id, 'rejected')}>{__l(props.lang, 'reject', 'отклонить')}</button>
                  <button class="shop-btn shop-btn-secondary" onClick={() => { setReviewContentId(null); setContentFeedback('') }}>{__l(props.lang, 'cancel', 'отмена')}</button>
                </div>
              </div>
            </Show>
            <Show when={item.status === 'pending' && reviewContentId() !== item.id}>
              <div class="auth-actions">
                <button class="shop-btn" onClick={() => setReviewContentId(item.id)}>{__l(props.lang, 'review', 'рассмотреть')}</button>
              </div>
            </Show>
          </div>
        )}
      </For>
    </section>
  )
}
