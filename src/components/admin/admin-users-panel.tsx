import { For, Show, createSignal } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { Lang } from '@/types/content'
import type { AdminUser } from '@/lib/api/admin'

function __l(lang: string, en: string, ru: string): string { return lang === 'ru' ? ru : en }

export function AdminUsersPanel(props: { lang: Lang; users: Accessor<AdminUser[]>; updateUser: (id: number, d: { email?: string; password?: string; ban?: boolean }) => Promise<{ ok: boolean }>; deleteUser: (id: number) => Promise<{ ok: boolean }>; reload: () => void }) {
  const [editId, setEditId] = createSignal<number | null>(null)
  const [editEmail, setEditEmail] = createSignal('')
  const [editPassword, setEditPassword] = createSignal('')
  const [errorMsg, setErrorMsg] = createSignal<string | null>(null)

  const handleUpdate = async (id: number) => {
    const data: { email?: string; password?: string } = {}
    if (editEmail().trim()) data.email = editEmail().trim()
    if (editPassword().trim()) data.password = editPassword().trim()
    try { await props.updateUser(id, data); setEditId(null); setEditEmail(''); setEditPassword(''); props.reload() }
    catch (err) { setErrorMsg(err instanceof Error ? err.message : 'Update failed') }
  }

  const toggleBan = async (user: AdminUser) => {
    try { await props.updateUser(user.id, { ban: !user.banned }); props.reload() }
    catch (err) { setErrorMsg(err instanceof Error ? err.message : 'Toggle failed') }
  }

  const handleDelete = async (id: number) => {
    try { await props.deleteUser(id); props.reload() }
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
      <Show when={props.users().length > 0} fallback={<p class="shop-empty">{__l(props.lang, 'no users', 'нет пользователей')}</p>}>
        <For each={props.users()}>
          {(user) => (
            <div class="admin-order-card">
              <div class="order-card-top">
                <h2>{user.email}</h2>
                <span class={`order-status ${user.banned ? 'shop-status-sold_out' : 'shop-status-available'}`}>
                  {user.banned ? (__l(props.lang, 'banned', 'забанен')) : 'active'}
                </span>
              </div>
              <div class="order-card-meta">
                <span>ID: {user.id}</span>
                <span>{user.email_verified ? 'verified' : 'unverified'}</span>
                <span>{new Date(user.created_at).toLocaleDateString()}</span>
              </div>
              <Show when={editId() === user.id}>
                <div class="auth-form">
                  <label class="form-field"><span class="form-label">email</span><input class="form-input" value={editEmail()} onInput={(e) => setEditEmail(e.currentTarget.value)} placeholder={user.email} /></label>
                  <label class="form-field"><span class="form-label">{__l(props.lang, 'password', 'пароль')}</span><input class="form-input" type="password" value={editPassword()} onInput={(e) => setEditPassword(e.currentTarget.value)} placeholder="••••••••" /></label>
                  <div class="auth-actions"><button class="shop-btn" onClick={() => handleUpdate(user.id)}>{__l(props.lang, 'save', 'сохранить')}</button><button class="shop-btn shop-btn-secondary" onClick={() => setEditId(null)}>{__l(props.lang, 'cancel', 'отмена')}</button></div>
                </div>
              </Show>
              <div class="auth-actions">
                <button class="shop-btn" onClick={() => { setEditId(user.id); setEditEmail(''); setEditPassword('') }}>{__l(props.lang, 'edit', 'ред.')}</button>
                <button class={`shop-btn ${user.banned ? 'is-active' : 'shop-btn-secondary'}`} onClick={() => toggleBan(user)}>{user.banned ? (__l(props.lang, 'unban', 'разбанить')) : (__l(props.lang, 'ban', 'забанить'))}</button>
                <button class="shop-btn shop-btn-secondary" onClick={() => handleDelete(user.id)}>{__l(props.lang, 'delete', 'удалить')}</button>
              </div>
            </div>
          )}
        </For>
      </Show>
    </section>
  )
}
