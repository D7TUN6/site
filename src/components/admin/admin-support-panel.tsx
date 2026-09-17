import { For, Show, createEffect, createMemo, createSignal } from 'solid-js'
import type { Lang } from '@/types/content'
import type { AdminSupportTicket } from '@/lib/api/admin'
import { UiSelect } from '@/components/ui-select'
import type { UiSelectOption } from '@/components/ui-select'

function __l(lang: string, en: string, ru: string): string { return lang === 'ru' ? ru : en }

export function AdminSupportPanel(props: {
  lang: Lang
  getTickets: (status?: string) => Promise<{ ok: boolean; tickets: AdminSupportTicket[] }>
  updateTicket: (id: number, data: { status?: string; adminNotes?: string }) => Promise<{ ok: boolean }>
}) {
  const [statusFilter, setStatusFilter] = createSignal<string>('')
  const [tickets, setTickets] = createSignal<AdminSupportTicket[]>([])
  const [loading, setLoading] = createSignal(false)
  const [errorMsg, setErrorMsg] = createSignal<string | null>(null)
  const [editId, setEditId] = createSignal<number | null>(null)
  const [editStatus, setEditStatus] = createSignal<string>('')
  const [editNotes, setEditNotes] = createSignal('')

  const loadTickets = async () => {
    setLoading(true)
    try {
      const data = await props.getTickets(statusFilter() || undefined)
      setTickets(data.tickets)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load tickets')
    }
    setLoading(false)
  }

  const handleUpdate = async (id: number) => {
    try {
      const data: { status?: string; adminNotes?: string } = {}
      if (editStatus()) data.status = editStatus()
      if (editNotes()) data.adminNotes = editNotes()
      if (Object.keys(data).length === 0) return
      await props.updateTicket(id, data)
      setEditId(null)
      setEditStatus('')
      setEditNotes('')
      await loadTickets()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update ticket')
    }
  }

  createEffect(() => { loadTickets() })

  const statuses = ['open', 'in_progress', 'resolved', 'closed']
  const filterOptions = createMemo<UiSelectOption[]>(() => [
    { value: '', label: __l(props.lang, 'all', 'все') },
    ...statuses.map((s) => ({ value: s, label: s })),
  ])

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
      <div class="shop-filters">
        <label class="form-field shop-filter">
          <span class="form-label">{__l(props.lang, 'status', 'статус')}</span>
          <UiSelect
            modelValue={statusFilter()}
            options={filterOptions()}
            onChange={(v) => { setStatusFilter(v); loadTickets() }}
            ariaLabel={__l(props.lang, 'Status', 'Статус')}
          />
        </label>
      </div>
      <Show when={!loading() || tickets().length > 0} fallback={<p class="shop-empty">{__l(props.lang, 'loading...', 'загрузка...')}</p>}>
        <Show when={tickets().length > 0} fallback={<p class="shop-empty">{__l(props.lang, 'no tickets', 'нет тикетов')}</p>}>
          <For each={tickets()}>
            {(ticket) => (
              <div class="admin-order-card">
                <div class="order-card-top">
                  <h2>#{ticket.id} {ticket.subject}</h2>
                  <span class="order-status">{ticket.status}</span>
                </div>
                <div class="order-card-meta">
                  <span>{ticket.userEmail || `user #${ticket.userId}`}</span>
                  <span>{new Date(ticket.createdAt).toLocaleDateString()}</span>
                </div>
                <p class="support-ticket-message">{ticket.message}</p>
                <Show when={ticket.adminNotes}>
                  <div class="support-ticket-notes">
                    <strong>{__l(props.lang, 'notes:', 'заметки:')}</strong> {ticket.adminNotes}
                  </div>
                </Show>
                <Show when={editId() === ticket.id}>
                  <div class="support-edit-form">
                    <label class="form-field">
                      <span class="form-label">{__l(props.lang, 'status', 'статус')}</span>
                      <UiSelect
                        modelValue={editStatus() || ticket.status}
                        options={statuses.map((s) => ({ value: s, label: s }))}
                        onChange={(v) => setEditStatus(v)}
                        ariaLabel={__l(props.lang, 'Status', 'Статус')}
                      />
                    </label>
                    <label class="form-field">
                      <span class="form-label">{__l(props.lang, 'notes', 'заметки')}</span>
                      <textarea class="form-input form-textarea" rows={3} value={editNotes() || ticket.adminNotes} onInput={(e) => setEditNotes(e.currentTarget.value)} />
                    </label>
                    <div class="auth-actions">
                      <button class="shop-btn" onClick={() => handleUpdate(ticket.id)}>{__l(props.lang, 'save', 'сохранить')}</button>
                      <button class="shop-btn shop-btn-secondary" onClick={() => setEditId(null)}>{__l(props.lang, 'cancel', 'отмена')}</button>
                    </div>
                  </div>
                </Show>
                <div class="auth-actions">
                  <button class="shop-btn" onClick={() => { setEditId(ticket.id); setEditStatus(''); setEditNotes('') }}>
                    {__l(props.lang, 'edit', 'ред.')}
                  </button>
                </div>
              </div>
            )}
          </For>
        </Show>
      </Show>
    </section>
  )
}
