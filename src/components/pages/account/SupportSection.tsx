import { For, Show, createSignal, onMount, onCleanup } from 'solid-js'
import { createSupportTicket, getMySupportTickets, SUPPORT_CATEGORIES, type SupportTicket } from '@/lib/api/support'
import type { Lang } from '@/types/content'

const CAT_LABEL: Record<string, (lang: Lang) => string> = {
  technical: (lang) => lang === 'ru' ? 'техническая проблема' : 'technical',
  billing: (lang) => lang === 'ru' ? 'оплата' : 'billing',
  content: (lang) => lang === 'ru' ? 'контент' : 'content',
  account: (lang) => lang === 'ru' ? 'аккаунт' : 'account',
  feature: (lang) => lang === 'ru' ? 'предложение' : 'feature request',
  other: (lang) => lang === 'ru' ? 'другое' : 'other',
}

export function SupportSection(props: { lang: Lang; isAuthenticated: () => boolean }) {
  const [supportTickets, setSupportTickets] = createSignal<SupportTicket[]>([])
  const [supportSubject, setSupportSubject] = createSignal('')
  const [supportMessage, setSupportMessage] = createSignal('')
  const [supportCategory, setSupportCategory] = createSignal('technical')
  const [supportStatus, setSupportStatus] = createSignal<'idle' | 'loading' | 'error' | 'ok'>('idle')
  const [supportMessageText, setSupportMessageText] = createSignal('')
  const [supportOpen, setSupportOpen] = createSignal(false)
  const [catOpen, setCatOpen] = createSignal(false)
  let catRef: HTMLDivElement | undefined

  function handleCatOutside(ev: PointerEvent) {
    const node = ev.target as Node | null
    if (!node || !catRef) return
    if (!catRef.contains(node)) setCatOpen(false)
  }

  onMount(() => { window.addEventListener('pointerdown', handleCatOutside) })
  onCleanup(() => { window.removeEventListener('pointerdown', handleCatOutside) })

  const loadTickets = async () => {
    if (!props.isAuthenticated()) return
    try {
      const data = await getMySupportTickets()
      setSupportTickets(data.tickets)
    } catch {}
  }

  const submitTicket = async () => {
    setSupportStatus('loading')
    setSupportMessageText('')
    try {
      await createSupportTicket({ subject: supportSubject().trim(), message: supportMessage().trim(), category: supportCategory() })
      setSupportSubject('')
      setSupportMessage('')
      setSupportCategory('technical')
      setSupportOpen(false)
      setSupportStatus('ok')
      await loadTickets()
    } catch (err) {
      setSupportStatus('error')
      setSupportMessageText(err instanceof Error ? err.message : 'Failed to submit ticket')
    }
  }

  return (
    <section class="account-support">
      <div class="account-support-header">
        <h2>{props.lang === 'ru' ? 'поддержка' : 'support'}</h2>
        <button class="shop-btn" type="button" onClick={() => { setSupportOpen(!supportOpen()); loadTickets() }}>
          {supportOpen() ? (props.lang === 'ru' ? 'закрыть' : 'close') : (props.lang === 'ru' ? 'создать тикет' : 'new ticket')}
        </button>
      </div>
      <Show when={supportOpen()}>
        <div class="support-form">
          <label class="form-field">
            <span class="form-label">{props.lang === 'ru' ? 'категория' : 'category'}</span>
            <div ref={catRef} class="lofi-dropdown">
              <button type="button" class="form-input lofi-dropdown-trigger" onClick={() => setCatOpen(!catOpen())}>
                <span>{CAT_LABEL[supportCategory()]?.(props.lang) ?? supportCategory()}</span>
                <span class="lofi-dropdown-arrow">{catOpen() ? '▲' : '▼'}</span>
              </button>
              <Show when={catOpen()}>
                <div class="lofi-dropdown-menu">
                  <For each={SUPPORT_CATEGORIES}>
                    {(cat) => (
                      <button type="button"
                        class={`lofi-dropdown-option${supportCategory() === cat ? ' is-selected' : ''}`}
                        onClick={() => { setSupportCategory(cat); setCatOpen(false) }}
                      >
                        {CAT_LABEL[cat]?.(props.lang) ?? cat}
                      </button>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </label>
          <label class="form-field">
            <span class="form-label">{props.lang === 'ru' ? 'тема' : 'subject'}</span>
            <input class="form-input" value={supportSubject()} onInput={(e) => setSupportSubject(e.currentTarget.value)} />
          </label>
          <label class="form-field">
            <span class="form-label">{props.lang === 'ru' ? 'сообщение' : 'message'}</span>
            <textarea class="form-input form-textarea" rows={5} value={supportMessage()} onInput={(e) => setSupportMessage(e.currentTarget.value)} />
          </label>
          <div class="auth-actions">
            <button class="shop-btn" type="button" disabled={supportStatus() === 'loading'} onClick={submitTicket}>
              {props.lang === 'ru' ? 'отправить' : 'submit'}
            </button>
          </div>
          <Show when={supportStatus() === 'error'}><p class="cart-empty" role="alert">{supportMessageText()}</p></Show>
          <Show when={supportStatus() === 'ok'}><p class="checkout-hint">{props.lang === 'ru' ? 'тикет создан' : 'ticket created'}</p></Show>
        </div>
      </Show>
      <Show when={supportTickets().length > 0}>
        <div class="support-ticket-list">
          <For each={supportTickets()}>
            {(ticket) => (
              <div class="support-ticket-card">
                <div class="order-card-top">
                  <strong>#{ticket.id} {ticket.subject}</strong>
                  <span class={`order-status ${ticket.status === 'open' || ticket.status === 'in_progress' ? 'shop-status-available' : ''}`}>{ticket.status}</span>
                </div>
                <div class="order-card-meta">
                  <span>{ticket.category}</span>
                  <span>{new Date(ticket.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </section>
  )
}
