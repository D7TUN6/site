import { For, Show, createSignal, onMount } from 'solid-js'
import type { Lang } from '@/types/content'
import { __l } from '../admin-panel'
import {
  getAdminSpecial,
  updateAdminSpecial,
  type AdminSpecial,
  type AdminThanksCard,
  type AdminWebringSite,
} from '@/lib/api/admin-special'

type Status = 'loading' | 'idle' | 'saving' | 'saved' | 'error'

export function AdminSpecialEditor(props: { lang: Lang }) {
  const l = (en: string, ru: string) => __l(props.lang, en, ru)
  const [data, setData] = createSignal<AdminSpecial | null>(null)
  const [status, setStatus] = createSignal<Status>('loading')
  const [message, setMessage] = createSignal('')

  const load = async () => {
    setStatus('loading')
    try {
      setData(await getAdminSpecial())
      setStatus('idle')
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : String(err))
    }
  }
  onMount(load)

  const patch = (partial: Partial<AdminSpecial>) => setData((cur) => (cur ? { ...cur, ...partial } : cur))

  const move = <T,>(list: T[], index: number, delta: number): T[] => {
    const next = [...list]
    const target = index + delta
    if (target < 0 || target >= next.length) return next
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    return next
  }

  const updateThanks = (index: number, partial: Partial<AdminThanksCard>) => {
    const current = data()
    if (!current) return
    patch({ thanks: current.thanks.map((card, i) => (i === index ? { ...card, ...partial } : card)) })
  }
  const addThanks = () => {
    const current = data()
    if (!current) return
    patch({ thanks: [...current.thanks, { id: `thanks-${Date.now()}`, name: '', role: { en: '', ru: '' }, text: { en: '', ru: '' }, avatar: '', url: '' }] })
  }
  const removeThanks = (index: number) => {
    const current = data()
    if (!current) return
    patch({ thanks: current.thanks.filter((_, i) => i !== index) })
  }

  const updateRing = (index: number, partial: Partial<AdminWebringSite>) => {
    const current = data()
    if (!current) return
    patch({ webring: current.webring.map((site, i) => (i === index ? { ...site, ...partial } : site)) })
  }
  const addRing = () => {
    const current = data()
    if (!current) return
    patch({ webring: [...current.webring, { id: `ring-${Date.now()}`, name: '', url: '', badge: '', owner: '' }] })
  }
  const removeRing = (index: number) => {
    const current = data()
    if (!current) return
    patch({ webring: current.webring.filter((_, i) => i !== index) })
  }

  const save = async () => {
    const current = data()
    if (!current) return
    setStatus('saving')
    try {
      setData(await updateAdminSpecial(current))
      setStatus('saved')
      setMessage(l('saved — already live on the site', 'сохранено — уже на сайте'))
      window.setTimeout(() => setStatus((s) => (s === 'saved' ? 'idle' : s)), 2500)
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <section class="admin-special">
      <Show when={data()} fallback={<p class="page-loading">{status() === 'error' ? message() : l('loading…', 'загрузка…')}</p>}>
        <div class="admin-special-head">
          <h3>{l('special page', 'страница special')}</h3>
          <button type="button" class="shop-btn" disabled={status() === 'saving'} onClick={save}>
            {status() === 'saving' ? l('saving…', 'сохранение…') : l('save', 'сохранить')}
          </button>
        </div>
        <Show when={status() === 'saved' || status() === 'error'}>
          <p class={status() === 'error' ? 'checkout-hint' : 'comment-hint'}>{message()}</p>
        </Show>

        <div class="admin-special-block">
          <h4>{l('bio', 'био')}</h4>
          <label class="form-field form-field-full">
            <span class="form-label">EN</span>
            <textarea class="form-textarea" rows="4" value={data()!.bio.en} onInput={(e) => patch({ bio: { ...data()!.bio, en: e.currentTarget.value } })} />
          </label>
          <label class="form-field form-field-full">
            <span class="form-label">RU</span>
            <textarea class="form-textarea" rows="4" value={data()!.bio.ru} onInput={(e) => patch({ bio: { ...data()!.bio, ru: e.currentTarget.value } })} />
          </label>
        </div>

        <div class="admin-special-block">
          <div class="admin-special-block-head">
            <h4>{l('special thanks', 'благодарности')}</h4>
            <button type="button" class="shop-btn shop-btn-secondary" onClick={addThanks}>{l('add card', 'добавить')}</button>
          </div>
          <For each={data()!.thanks}>
            {(card, index) => (
              <div class="admin-special-row">
                <div class="admin-special-row-fields">
                  <label class="form-field"><span class="form-label">{l('name', 'ник')}</span><input class="form-input" value={card.name} onInput={(e) => updateThanks(index(), { name: e.currentTarget.value })} /></label>
                  <label class="form-field"><span class="form-label">{l('avatar filename', 'файл аватара')}</span><input class="form-input" value={card.avatar} placeholder="emily.webp" onInput={(e) => updateThanks(index(), { avatar: e.currentTarget.value })} /></label>
                  <label class="form-field"><span class="form-label">{l('url', 'ссылка')}</span><input class="form-input" value={card.url} placeholder="https://t.me/..." onInput={(e) => updateThanks(index(), { url: e.currentTarget.value })} /></label>
                  <label class="form-field"><span class="form-label">{l('role EN', 'роль EN')}</span><input class="form-input" value={card.role.en} onInput={(e) => updateThanks(index(), { role: { ...card.role, en: e.currentTarget.value } })} /></label>
                  <label class="form-field"><span class="form-label">{l('role RU', 'роль RU')}</span><input class="form-input" value={card.role.ru} onInput={(e) => updateThanks(index(), { role: { ...card.role, ru: e.currentTarget.value } })} /></label>
                </div>
                <label class="form-field form-field-full"><span class="form-label">{l('text EN', 'текст EN')}</span><textarea class="form-textarea" rows="2" value={card.text.en} onInput={(e) => updateThanks(index(), { text: { ...card.text, en: e.currentTarget.value } })} /></label>
                <label class="form-field form-field-full"><span class="form-label">{l('text RU', 'текст RU')}</span><textarea class="form-textarea" rows="2" value={card.text.ru} onInput={(e) => updateThanks(index(), { text: { ...card.text, ru: e.currentTarget.value } })} /></label>
                <div class="admin-special-row-actions">
                  <button type="button" class="shop-btn shop-btn-secondary" onClick={() => patch({ thanks: move(data()!.thanks, index(), -1) })}>↑</button>
                  <button type="button" class="shop-btn shop-btn-secondary" onClick={() => patch({ thanks: move(data()!.thanks, index(), 1) })}>↓</button>
                  <button type="button" class="shop-btn shop-btn-danger" onClick={() => removeThanks(index())}>{l('delete', 'удалить')}</button>
                </div>
              </div>
            )}
          </For>
        </div>

        <div class="admin-special-block">
          <h4>{l('88x31 banner embed code', 'код встраивания 88x31')}</h4>
          <label class="form-field form-field-full">
            <span class="form-label">HTML</span>
            <textarea class="form-textarea" rows="3" value={data()!.bannerHtml} onInput={(e) => patch({ bannerHtml: e.currentTarget.value })} />
          </label>
        </div>

        <div class="admin-special-block">
          <div class="admin-special-block-head">
            <h4>{l('webring sites', 'сайты веб-ринга')}</h4>
            <button type="button" class="shop-btn shop-btn-secondary" onClick={addRing}>{l('add site', 'добавить сайт')}</button>
          </div>
          <p class="comment-hint">{l('confirmed mutual sites only', 'только подтверждённые взаимные сайты')}</p>
          <For each={data()!.webring}>
            {(site, index) => (
              <div class="admin-special-row">
                <div class="admin-special-row-fields">
                  <label class="form-field"><span class="form-label">{l('name', 'название')}</span><input class="form-input" value={site.name} onInput={(e) => updateRing(index(), { name: e.currentTarget.value })} /></label>
                  <label class="form-field"><span class="form-label">{l('site url', 'url сайта')}</span><input class="form-input" value={site.url} placeholder="https://" onInput={(e) => updateRing(index(), { url: e.currentTarget.value })} /></label>
                  <label class="form-field"><span class="form-label">{l('badge url', 'url бейджа')}</span><input class="form-input" value={site.badge} placeholder="https://…/88x31.gif" onInput={(e) => updateRing(index(), { badge: e.currentTarget.value })} /></label>
                  <label class="form-field"><span class="form-label">{l('owner', 'владелец')}</span><input class="form-input" value={site.owner} onInput={(e) => updateRing(index(), { owner: e.currentTarget.value })} /></label>
                </div>
                <div class="admin-special-row-actions">
                  <button type="button" class="shop-btn shop-btn-secondary" onClick={() => patch({ webring: move(data()!.webring, index(), -1) })}>↑</button>
                  <button type="button" class="shop-btn shop-btn-secondary" onClick={() => patch({ webring: move(data()!.webring, index(), 1) })}>↓</button>
                  <button type="button" class="shop-btn shop-btn-danger" onClick={() => removeRing(index())}>{l('delete', 'удалить')}</button>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </section>
  )
}
