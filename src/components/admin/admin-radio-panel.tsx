import { Show, createMemo, createResource, createSignal } from 'solid-js'
import type { Lang } from '@/types/content'
import { getAdminRadio, updateAdminRadioSchedule, regenerateAdminRadioStream } from '@/lib/api/admin-radio'

function __l(lang: string, en: string, ru: string): string { return lang === 'ru' ? ru : en }

export function AdminRadioPanel(props: { lang: Lang }) {
  const [data, { refetch }] = createResource(getAdminRadio)
  const [scheduleStr, setScheduleStr] = createSignal('')
  const [scheduleDirty, setScheduleDirty] = createSignal(false)
  const [errorMsg, setErrorMsg] = createSignal<string | null>(null)

  const scheduleText = createMemo(() => {
    const d = data(); if (!d) return ''
    if (scheduleDirty()) return scheduleStr()
    return d.schedule.map((s) => `${s.day}|${s.start}|${s.end}|${s.label}`).join('\n')
  })

  const handleSaveSchedule = async () => {
    const lines = scheduleStr().split('\n').map((l) => l.trim()).filter(Boolean)
    const schedule = lines.map((line) => {
      const [day, start, end, ...labelParts] = line.split('|')
      return { day: day || '', start: start || '', end: end || '', label: labelParts.join('|') || '' }
    })
    if (schedule.length === 0) return
    try { await updateAdminRadioSchedule(schedule); setScheduleDirty(false); refetch() }
    catch (err) { setErrorMsg(err instanceof Error ? err.message : 'Save failed') }
  }

  const handleRegenerate = async () => {
    try { await regenerateAdminRadioStream(); refetch() }
    catch (err) { setErrorMsg(err instanceof Error ? err.message : 'Regenerate failed') }
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
      <div class="auth-form">
        <h3>{__l(props.lang, 'schedule', 'расписание')}</h3>
        <p class="checkout-hint">{__l(props.lang, 'Format: day|start|end|label (one line = one slot)', 'Формат: день|начало|конец|метка (одна строка = один слот)')}</p>
        <textarea class="form-textarea" rows="8" value={scheduleText()} onInput={(e) => { setScheduleStr(e.currentTarget.value); setScheduleDirty(true) }} />
        <div class="auth-actions"><button class="shop-btn" onClick={handleSaveSchedule} disabled={!scheduleStr().trim()}>{__l(props.lang, 'save', 'сохранить')}</button></div>
      </div>
      <div class="auth-actions"><button class="shop-btn shop-btn-secondary" onClick={handleRegenerate}>{__l(props.lang, 'regenerate stream', 'перегенерировать поток')}</button></div>
      <Show when={data()}><p>{__l(props.lang, 'tracks from releases', 'треков из релизов')}: {data()!.tracks.length}</p></Show>
    </section>
  )
}
