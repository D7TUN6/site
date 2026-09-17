import { For, Show, createEffect, createSignal } from 'solid-js'
import type { Lang } from '@/types/content'
import type { AdminSubmission } from '@/lib/api/admin'

function __l(lang: string, en: string, ru: string): string { return lang === 'ru' ? ru : en }

export function AdminModerationPanel(props: {
  lang: Lang
  getSubmissions: (status?: string) => Promise<{ ok: boolean; submissions: AdminSubmission[] }>
  reviewSubmission: (id: number, body: { status: 'approved' | 'rejected'; feedback?: string; scheduledAt?: number | null }) => Promise<{ ok: boolean; status: string; scheduled?: boolean }>
}) {
  const [statusFilter, setStatusFilter] = createSignal<string>('pending')
  const [submissions, setSubmissions] = createSignal<AdminSubmission[]>([])
  const [loading, setLoading] = createSignal(false)
  const [errorMsg, setErrorMsg] = createSignal<string | null>(null)
  const [reviewId, setReviewId] = createSignal<number | null>(null)
  const [feedbackText, setFeedbackText] = createSignal('')
  const [scheduleDate, setScheduleDate] = createSignal('')

  const loadSubmissions = async () => {
    setLoading(true)
    try {
      const data = await props.getSubmissions(statusFilter() || undefined)
      setSubmissions(data.submissions)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load submissions')
    }
    setLoading(false)
  }

  createEffect(() => { loadSubmissions() })

  const handleReview = async (id: number, status: 'approved' | 'rejected') => {
    try {
      const body: { status: 'approved' | 'rejected'; feedback?: string; scheduledAt?: number | null } = { status }
      if (feedbackText().trim()) body.feedback = feedbackText().trim()
      if (status === 'approved' && scheduleDate().trim()) {
        body.scheduledAt = new Date(scheduleDate().trim()).getTime()
      }
      await props.reviewSubmission(id, body)
      setReviewId(null)
      setFeedbackText('')
      setScheduleDate('')
      await loadSubmissions()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Review failed')
    }
  }

  const typeLabel = (t: string) => {
    const labels: Record<string, string> = {
      artist_registration: __l(props.lang, 'artist registration', 'регистрация артиста'),
      release: __l(props.lang, 'release', 'релиз'),
      media_photo: __l(props.lang, 'photo', 'фото'),
      media_video: __l(props.lang, 'video', 'видео'),
      shop_product: __l(props.lang, 'shop product', 'товар'),
    }
    return labels[t] || t
  }

  const statusFilters = ['', 'pending', 'approved', 'rejected']

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

      <div class="auth-actions" style="margin-bottom:12px">
        <For each={statusFilters}>
          {(s) => (
            <button type="button" class={`shop-btn ${statusFilter() === s ? 'is-active' : 'shop-btn-secondary'}`} onClick={() => { setStatusFilter(s); setTimeout(loadSubmissions, 0) }}>
              {s === '' ? (__l(props.lang, 'all', 'все')) : (s === 'pending' ? (__l(props.lang, 'pending', 'ожидают')) : s === 'approved' ? (__l(props.lang, 'approved', 'одобрены')) : (__l(props.lang, 'rejected', 'отклонены')))}
            </button>
          )}
        </For>
      </div>

      <Show when={loading()} fallback={
        <Show when={submissions().length === 0}>
          <p class="shop-empty">{__l(props.lang, 'no submissions', 'нет заявок')}</p>
        </Show>
      }>
        <div class="release-download-spinner" style="margin:24px auto" />
      </Show>

      <For each={submissions()}>
        {(sub) => {
          const data = typeof sub.data === 'object' && sub.data ? sub.data as Record<string, unknown> : {}
          return (
            <div class="admin-order-card">
              <div class="order-card-top">
                <h2>{typeLabel(sub.type)} #{sub.id}</h2>
                <span class={`order-status ${sub.status === 'approved' ? 'shop-status-available' : sub.status === 'rejected' ? 'shop-status-sold_out' : ''}`}>
                  {sub.status}
                </span>
              </div>
              <div class="order-card-meta">
                <span>{sub.userEmail || `user #${sub.userId}`}</span>
                <span>{new Date(sub.createdAt).toLocaleDateString()}</span>
                <Show when={sub.artistId}><span>{__l(props.lang, 'artist', 'артист')} #{sub.artistId}</span></Show>
              </div>

              <Show when={data && Object.keys(data).length > 0}>
                <div style="font-family:var(--font-ui);font-size:0.85rem;margin:8px 0;padding:8px;background:var(--ui-surface-2);border-radius:4px;overflow-x:auto">
                  <Show when={sub.type === 'artist_registration'}>
                    <div style="display:grid;gap:4px">
                      <div><strong>{__l(props.lang, 'name', 'имя')}:</strong> {String(data.name || '')}</div>
                      <div><strong>slug:</strong> {String(data.slug || '')}</div>
                      <Show when={data.bio}><div><strong>bio:</strong> {String(data.bio).slice(0, 200)}</div></Show>
                      <Show when={data.avatarUrl}><div><strong>{__l(props.lang, 'avatar', 'аватар')}:</strong> {String(data.avatarUrl)}</div></Show>
                    </div>
                  </Show>
                  <Show when={sub.type === 'release'}>
                    <div style="display:grid;gap:4px">
                      <div><strong>{__l(props.lang, 'album', 'альбом')}:</strong> {String(data.albumname || data.title || '')}</div>
                      <Show when={data.artistid}><div><strong>artist ID:</strong> {String(data.artistid)}</div></Show>
                      <Show when={data.slug}><div><strong>slug:</strong> {String(data.slug)}</div></Show>
                      <Show when={data.releasedate}><div><strong>{__l(props.lang, 'date', 'дата')}:</strong> {String(data.releasedate)}</div></Show>
                      <Show when={data.releasetype}><div><strong>{__l(props.lang, 'type', 'тип')}:</strong> {String(data.releasetype)}</div></Show>
                      <Show when={data.genreen || data.genreru}><div><strong>genre:</strong> {String(data.genreen || data.genreru)}</div></Show>
                      <Show when={data.notes}><div><strong>notes:</strong> {String(data.notes).slice(0, 500)}</div></Show>
                    </div>
                  </Show>
                  <Show when={sub.type === 'media_photo'}>
                    <div style="display:grid;gap:4px">
                      <div><strong>{__l(props.lang, 'title', 'название')}:</strong> {String(data.title || '')}</div>
                      <Show when={data.artistid}><div><strong>artist ID:</strong> {String(data.artistid)}</div></Show>
                      <Show when={data.slug}><div><strong>slug:</strong> {String(data.slug)}</div></Show>
                      <Show when={data.date}><div><strong>{__l(props.lang, 'date', 'дата')}:</strong> {String(data.date)}</div></Show>
                      <Show when={data.tags}><div><strong>tags:</strong> {Array.isArray(data.tags) ? data.tags.join(', ') : String(data.tags)}</div></Show>
                      <Show when={data.images}><div><strong>images:</strong> {Array.isArray(data.images) ? data.images.length : 0}</div></Show>
                    </div>
                  </Show>
                  <Show when={sub.type === 'media_video'}>
                    <div style="display:grid;gap:4px">
                      <div><strong>{__l(props.lang, 'title', 'название')}:</strong> {String(data.title || '')}</div>
                      <Show when={data.artistid}><div><strong>artist ID:</strong> {String(data.artistid)}</div></Show>
                      <Show when={data.slug}><div><strong>slug:</strong> {String(data.slug)}</div></Show>
                      <Show when={data.date}><div><strong>{__l(props.lang, 'date', 'дата')}:</strong> {String(data.date)}</div></Show>
                      <Show when={data.duration}><div><strong>duration:</strong> {String(data.duration)}s</div></Show>
                      <Show when={data.description}><div><strong>description:</strong> {String(data.description).slice(0, 300)}</div></Show>
                    </div>
                  </Show>
                  <Show when={sub.type === 'shop_product'}>
                    <div style="display:grid;gap:4px">
                      <div><strong>{__l(props.lang, 'title', 'название')}:</strong> {String(data.title || '')}</div>
                      <Show when={data.artistid}><div><strong>artist ID:</strong> {String(data.artistid)}</div></Show>
                      <Show when={data.slug}><div><strong>slug:</strong> {String(data.slug)}</div></Show>
                      <Show when={data.category}><div><strong>category:</strong> {String(data.category)}</div></Show>
                      <Show when={data.price}><div><strong>price:</strong> {String(data.price)}</div></Show>
                      <Show when={data.quantity !== undefined}><div><strong>qty:</strong> {String(data.quantity)}</div></Show>
                      <Show when={data.descriptionen || data.descriptionru}><div><strong>desc:</strong> {String(data.descriptionen || data.descriptionru).slice(0, 300)}</div></Show>
                    </div>
                  </Show>
                  <Show when={!['artist_registration', 'release', 'media_photo', 'media_video', 'shop_product'].includes(sub.type)}>
                    <pre style="margin:0;white-space:pre-wrap;word-break:break-word">{JSON.stringify(data, null, 2)}</pre>
                  </Show>
                </div>
              </Show>

              <Show when={sub.feedback}>
                <div style="font-family:var(--font-ui);font-size:0.85rem;margin:4px 0;padding:6px 8px;border-left:3px solid var(--accent-hot);background:var(--ui-surface-2);border-radius:2px">
                  <strong>{__l(props.lang, 'feedback:', 'отзыв:')}</strong> {sub.feedback}
                </div>
              </Show>

              <Show when={reviewId() === sub.id}>
                <div class="auth-form">
                  <label class="form-field form-field-full">
                    <span class="form-label">{__l(props.lang, 'feedback', 'отзыв')}</span>
                    <textarea class="form-textarea" rows="3" value={feedbackText()} onInput={(e) => setFeedbackText(e.currentTarget.value)} placeholder={__l(props.lang, 'reason for rejection (optional)', 'причина отклонения (опционально)')} />
                  </label>
                  <label class="form-field">
                    <span class="form-label">{__l(props.lang, 'schedule for', 'запланировать на')}</span>
                    <input class="form-input" type="datetime-local" value={scheduleDate()} onInput={(e) => setScheduleDate(e.currentTarget.value)} />
                  </label>
                  <div class="auth-actions">
                    <button class="shop-btn" onClick={() => handleReview(sub.id, 'approved')}>{__l(props.lang, 'approve', 'одобрить')}</button>
                    <button class="shop-btn shop-btn-secondary" onClick={() => handleReview(sub.id, 'rejected')}>{__l(props.lang, 'reject', 'отклонить')}</button>
                    <button class="shop-btn shop-btn-secondary" onClick={() => { setReviewId(null); setFeedbackText(''); setScheduleDate('') }}>{__l(props.lang, 'cancel', 'отмена')}</button>
                  </div>
                </div>
              </Show>

              <Show when={sub.status === 'pending' && reviewId() !== sub.id}>
                <div class="auth-actions">
                  <button class="shop-btn" onClick={() => setReviewId(sub.id)}>{__l(props.lang, 'review', 'рассмотреть')}</button>
                </div>
              </Show>
            </div>
          )
        }}
      </For>
    </section>
  )
}
