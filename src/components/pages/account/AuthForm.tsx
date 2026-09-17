import { Show, createSignal } from 'solid-js'
import { login, register } from '@/lib/api/auth'
import { adminLogin } from '@/lib/api/admin'
import type { UiCopy } from '@/lib/uiText'
import type { Lang } from '@/types/content'
import type { AuthState } from '@/types/auth'

export function AuthForm(props: {
  lang: Lang
  copy: UiCopy
  navigate: (href: string, event?: MouseEvent) => void
  setSession: (state: AuthState | ((prev: AuthState) => AuthState)) => void
  setIsAdmin: (value: boolean | ((prev: boolean) => boolean)) => void
}) {
  const [email, setEmail] = createSignal('')
  const [password, setPassword] = createSignal('')
  const [authMode, setAuthMode] = createSignal<'login' | 'register'>('login')
  const [authStatus, setAuthStatus] = createSignal<'idle' | 'loading' | 'error' | 'ok'>('idle')
  const [authMessage, setAuthMessage] = createSignal('')

  async function submitAuth() {
    const setSession = props.setSession
    const setIsAdmin = props.setIsAdmin
    setAuthStatus('loading')
    setAuthMessage('')
    try {
      const payload = { email: email().trim(), password: password() }
      const result = authMode() === 'login' ? await login(payload) : await register(payload)
      setSession({ authenticated: Boolean(result?.user), user: result?.user ?? null })
      await adminLogin(payload)
        .then(() => setIsAdmin(true))
        .catch(() => setIsAdmin(false))
      setAuthStatus('idle')
    } catch (error) {
      if (authMode() === 'login') {
        const payload = { email: email().trim(), password: password() }
        const adminResult = await adminLogin(payload).catch(() => null)
        if (adminResult?.ok) {
          setIsAdmin(true)
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

  return (
    <section class="auth" aria-label={props.lang === 'ru' ? 'Вход или регистрация' : 'Sign in or register'}>
      <div class="auth-tabs" role="tablist">
        <button class={`shop-btn ${authMode() === 'login' ? 'is-active' : 'shop-btn-secondary'}`} type="button" role="tab" aria-selected={authMode() === 'login'} onClick={() => setAuthMode('login')}>{props.copy.login}</button>
        <button class={`shop-btn ${authMode() === 'register' ? 'is-active' : 'shop-btn-secondary'}`} type="button" role="tab" aria-selected={authMode() === 'register'} onClick={() => setAuthMode('register')}>{props.copy.register}</button>
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
        <Show when={authStatus() === 'error'}><p class="cart-empty" role="alert">{authMessage()}</p></Show>
      </div>
    </section>
  )
}
