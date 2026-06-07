import { For, Show, createSignal } from 'solid-js'
import { login, register } from '@/lib/api/auth'
import { adminLogin } from '@/lib/api/admin'
import { logout as authLogout } from '@/lib/api/auth'
import { adminLogout } from '@/lib/api/admin'
import type { UiCopy } from '@/lib/uiText'
import type { Lang } from '@/types/content'
import type { AuthState } from '@/types/auth'
import type { OrderSummary } from '@/lib/api/orders'

export function AccountPage(props: {
  lang: Lang
  copy: UiCopy
  navigate: (href: string, event?: MouseEvent) => void
  session: () => AuthState
  setSession: (state: AuthState | ((prev: AuthState) => AuthState)) => void
  setIsAdmin: (value: boolean | ((prev: boolean) => boolean)) => void
  orders: () => OrderSummary[]
}) {
  const [email, setEmail] = createSignal('')
  const [password, setPassword] = createSignal('')
  const [authMode, setAuthMode] = createSignal<'login' | 'register'>('login')
  const [authStatus, setAuthStatus] = createSignal<'idle' | 'loading' | 'error' | 'ok'>('idle')
  const [authMessage, setAuthMessage] = createSignal('')

  async function submitAuth() {
    setAuthStatus('loading')
    setAuthMessage('')
    try {
      const payload = { email: email().trim(), password: password() }
      const result = authMode() === 'login' ? await login(payload) : await register(payload)
      props.setSession({ authenticated: Boolean(result?.user), user: result?.user ?? null })
      await adminLogin(payload)
        .then(() => props.setIsAdmin(true))
        .catch(() => props.setIsAdmin(false))
      setAuthStatus('idle')
    } catch (error) {
      if (authMode() === 'login') {
        const payload = { email: email().trim(), password: password() }
        const adminResult = await adminLogin(payload).catch(() => null)
        if (adminResult?.ok) {
          props.setIsAdmin(true)
          setAuthStatus('ok')
          setAuthMessage(props.lang === 'ru' ? 'Вход выполнен как админ. Перенаправляю в /admin.' : 'Logged in as admin. Redirecting to /admin.')
          props.navigate(`/${props.lang}/admin`)
          return
        }
      }
      setAuthStatus('error')
      setAuthMessage(error instanceof Error ? error.message : 'Authentication failed')
    }
  }

  async function submitLogout() {
    await authLogout()
    await adminLogout().catch(() => {})
    props.setSession({ authenticated: false, user: null })
    props.setIsAdmin(false)
  }

  return (
    <>
      <h1>{props.copy.accountTitle}</h1>
      <section class="account">
        <div class="account-head">
          <Show
            when={props.session().authenticated && props.session().user}
            fallback={(
              <>
                <div class="account-email">{props.copy.authSignInHint}</div>
                <div class="auth-tabs">
                  <button class="shop-btn" type="button" onClick={() => setAuthMode('login')}>{props.copy.login}</button>
                  <button class="shop-btn shop-btn-secondary" type="button" onClick={() => setAuthMode('register')}>{props.copy.register}</button>
                </div>
              </>
            )}
          >
            {(user) => (
              <>
                <div class="account-email">{user().email}</div>
                <button class="shop-btn" type="button" onClick={submitLogout}>{props.copy.authLogout}</button>
              </>
            )}
          </Show>
        </div>

        <Show when={props.session().authenticated}>
          <section class="account-orders">
            <h2>{props.lang === 'ru' ? 'заказы' : 'orders'}</h2>
            <Show when={props.orders().length > 0} fallback={<p class="checkout-hint">{props.lang === 'ru' ? 'Заказов пока нет' : 'No orders yet'}</p>}>
              <div class="order-list">
                <For each={props.orders()}>
                  {(order) => (
                    <div class="order-card">
                      <div class="order-card-top"><strong>{order.id}</strong><span class="order-status">{order.status}</span></div>
                      <div class="order-card-meta"><span>{order.shippingProvider}</span><span>{order.total.value} ₽</span></div>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </section>
        </Show>

        <Show when={!props.session().authenticated}>
          <div class="auth">
            <div class="auth-tabs">
              <button class={`shop-btn ${authMode() === 'login' ? 'is-active' : 'shop-btn-secondary'}`} type="button" onClick={() => setAuthMode('login')}>{props.copy.login}</button>
              <button class={`shop-btn ${authMode() === 'register' ? 'is-active' : 'shop-btn-secondary'}`} type="button" onClick={() => setAuthMode('register')}>{props.copy.register}</button>
            </div>
            <div class="auth-form">
              <label class="form-field">
                <span class="form-label">email</span>
                <input class="form-input" value={email()} onInput={(e) => setEmail(e.currentTarget.value)} />
              </label>
              <label class="form-field">
                <span class="form-label">password</span>
                <input class="form-input" type="password" value={password()} onInput={(e) => setPassword(e.currentTarget.value)} />
              </label>
              <div class="auth-actions">
                <button class="shop-btn" type="button" disabled={authStatus() === 'loading'} onClick={submitAuth}>{authMode() === 'login' ? props.copy.authLogin : props.copy.authRegister}</button>
              </div>
              <Show when={authStatus() === 'error'}><p class="cart-empty">{authMessage()}</p></Show>
            </div>
          </div>
        </Show>
      </section>
    </>
  )
}
