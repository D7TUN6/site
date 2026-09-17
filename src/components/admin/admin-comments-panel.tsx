import { For, Show, createSignal } from 'solid-js'
import type { Lang } from '@/types/content'
import { getAdminComments, approveAdminComment, deleteAdminComment, banAdminUser, type AdminComment } from '@/lib/api/admin'

function __l(lang: string, en: string, ru: string): string { return lang === 'ru' ? ru : en }

const FILTERS = ['pending', 'approved', 'deleted'] as const

export function AdminCommentsPanel(props: { lang: Lang }) {
  const [comments, setComments] = createSignal<AdminComment[]>([])
  const [filter, setFilter] = createSignal<'pending' | 'approved' | 'deleted'>('pending')
  const [loading, setLoading] = createSignal(false)
  const [errorMsg, setErrorMsg] = createSignal<string | null>(null)
  const [banConfirm, setBanConfirm] = createSignal<AdminComment | null>(null)

  const load = async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const res = await getAdminComments(filter())
      setComments(res.comments ?? [])
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : __l(props.lang, 'Load failed', 'Ошибка загрузки'))
    } finally {
      setLoading(false)
    }
  }

  const switchFilter = async (f: 'pending' | 'approved' | 'deleted') => {
    setFilter(f)
    await load()
  }

  const doApprove = async (id: number) => {
    try { await approveAdminComment(id); await load() }
    catch (err) { setErrorMsg(err instanceof Error ? err.message : 'Approve failed') }
  }

  const doDelete = async (id: number) => {
    try { await deleteAdminComment(id); await load() }
    catch (err) { setErrorMsg(err instanceof Error ? err.message : 'Delete failed') }
  }

  const doBan = async (comment: AdminComment) => {
    setBanConfirm(null)
    try {
      await banAdminUser(comment.author_id)
      await load()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Ban failed')
    }
  }

  const openBanConfirm = (c: AdminComment) => { setBanConfirm(c); setErrorMsg(null) }

  return (
    <section class="admin-orders">
      <div class="auth-tabs">
        <For each={FILTERS}>{(f) => (
          <button type="button" class={`shop-btn ${filter() === f ? 'is-active' : 'shop-btn-secondary'}`} onClick={() => void switchFilter(f)}>{f}</button>
        )}</For>
        <button type="button" class="shop-btn shop-btn-secondary" onClick={() => void load()}>{__l(props.lang, 'reload', 'обновить')}</button>
      </div>

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

      <Show when={loading()} fallback={(
        <Show when={comments().length > 0} fallback={<p class="shop-empty">{__l(props.lang, 'no comments', 'нет комментариев')}</p>}>
          <For each={comments()}>{(c) => (
            <div class="admin-order-card">
              <div class="order-card-top">
                <h2>#{c.id} · {c.email || `user#${c.author_id}`}</h2>
                <span class="order-status">{c.status}</span>
              </div>
              <div class="order-card-meta">
                <span>ID: {c.id}</span>
                <span>{c.author_id}</span>
                <span>{c.email || '—'}</span>
                <span>{new Date(c.created_at * 1000).toLocaleString()}</span>
                <Show when={c.parent_id !== null}><span>reply → #{c.parent_id}</span></Show>
                <Show when={c.banned}><span class="order-status">[banned]</span></Show>
              </div>
              <div class="admin-comment-content">{c.post_slug}</div>
              <div class="admin-comment-content">{c.content}</div>
              <div class="auth-actions">
                <Show when={c.status === 'pending'}>
                  <button type="button" class="shop-btn shop-btn-secondary" onClick={() => void doApprove(c.id)}>{__l(props.lang, 'approve', 'одобрить')}</button>
                </Show>
                <button type="button" class="shop-btn shop-btn-secondary" onClick={() => void doDelete(c.id)}>{__l(props.lang, 'delete', 'удалить')}</button>
                <button type="button" class="shop-btn shop-btn-danger" onClick={() => openBanConfirm(c)}>{__l(props.lang, 'ban user', 'забанить')}</button>
              </div>
            </div>
          )}</For>
        </Show>
      )}>
        {__l(props.lang, 'loading...', 'загрузка...')}
      </Show>

      <Show when={banConfirm()}>
        <div class="confirm-overlay" role="dialog" aria-modal="true" aria-label={__l(props.lang, 'Confirm ban', 'Подтверждение бана')} onClick={() => setBanConfirm(null)}>
          <div class="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p class="confirm-text">{__l(props.lang, `Ban user (ID ${banConfirm()!.author_id}) and hide all their comments?`, `Забанить пользователя (ID ${banConfirm()!.author_id}) и скрыть все его комментарии?`)}</p>
            <div class="confirm-actions">
              <button class="shop-btn shop-btn-danger" onClick={() => void doBan(banConfirm()!)}>{__l(props.lang, 'ban', 'забанить')}</button>
              <button class="shop-btn shop-btn-secondary" onClick={() => setBanConfirm(null)}>{__l(props.lang, 'cancel', 'отмена')}</button>
            </div>
          </div>
        </div>
      </Show>
    </section>
  )
}