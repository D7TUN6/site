import { Show } from 'solid-js'
import { logout as authLogout } from '@/lib/api/auth'
import { adminLogout } from '@/lib/api/admin'
import type { UiCopy } from '@/lib/uiText'
import type { Lang } from '@/types/content'
import type { AuthState } from '@/types/auth'
import type { OrderSummary } from '@/lib/api/orders'
import { AuthForm } from './account/AuthForm'
import { ArtistSection } from './account/ArtistSection'
import { SupportSection } from './account/SupportSection'
import { OrdersSection } from './account/OrdersSection'

export function AccountPage(props: {
  lang: Lang
  copy: UiCopy
  navigate: (href: string, event?: MouseEvent) => void
  session: () => AuthState
  setSession: (state: AuthState | ((prev: AuthState) => AuthState)) => void
  setIsAdmin: (value: boolean | ((prev: boolean) => boolean)) => void
  orders: () => OrderSummary[]
}) {
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
            fallback={<div class="account-email">{props.copy.authSignInHint}</div>}
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
          <ArtistSection lang={props.lang} isAuthenticated={() => Boolean(props.session().authenticated)} />
          <SupportSection lang={props.lang} isAuthenticated={() => Boolean(props.session().authenticated)} />
          <OrdersSection lang={props.lang} orders={props.orders} />
        </Show>

        <Show when={!props.session().authenticated}>
          <AuthForm
            lang={props.lang}
            copy={props.copy}
            navigate={props.navigate}
            setSession={props.setSession}
            setIsAdmin={props.setIsAdmin}
          />
        </Show>
      </section>
    </>
  )
}
