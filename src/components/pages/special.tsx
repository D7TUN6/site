import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js'
import type { Lang } from '@/types/content'
import { fetchSpecial, subscribeSpecial, type LocalizedSpecial, type LocalizedThanksCard, type WebringSite } from '@/lib/special'

function copyFor(lang: Lang) {
  return lang === 'ru'
    ? {
        profileRole: 'fullstack-программист, андеграунд-музыкант',
        thanksTitle: 'особая благодарность',
        thanksEmpty: 'список пока пуст',
        bannerTitle: '88x31 баннер сайта',
        bannerHint: 'вставь этот код на свой сайт:',
        copy: 'копировать',
        copied: 'скопировано!',
        webringTitle: 'вебринг',
        webringEmpty: 'вебринг пока пуст',
        webringHint: 'только подтверждённые взаимные сайты',
        prev: 'назад',
        random: 'случайно',
        next: 'вперёд',
        loading: 'загрузка...',
        error: 'не удалось загрузить содержимое',
      }
    : {
        profileRole: 'fullstack programmer, underground musician',
        thanksTitle: 'special thanks',
        thanksEmpty: 'the list is empty for now',
        bannerTitle: 'site 88x31 banner',
        bannerHint: 'embed this code on your site:',
        copy: 'copy',
        copied: 'copied!',
        webringTitle: 'webring',
        webringEmpty: 'the webring is empty for now',
        webringHint: 'confirmed mutual sites only',
        prev: 'prev',
        random: 'random',
        next: 'next',
        loading: 'loading...',
        error: 'failed to load content',
      }
}

const PROFILE_URL = 'https://t.me/d7tun6'

function ThanksCardInner(props: { card: LocalizedThanksCard }) {
  return (
    <>
      <div class="special-thanks-avatar">
        <Show when={props.card.avatar} fallback={<span class="special-avatar-fallback">{props.card.name.slice(0, 1).toUpperCase()}</span>}>
          <img src={props.card.avatar} alt={props.card.name} width="72" height="72" loading="lazy" />
        </Show>
      </div>
      <div class="special-thanks-body">
        <div class="special-thanks-head">
          <span class="special-thanks-name">{props.card.name}</span>
          <Show when={props.card.role}><span class="special-thanks-role">{props.card.role}</span></Show>
        </div>
        <p class="special-thanks-text">{props.card.text}</p>
      </div>
    </>
  )
}

function ThanksCardEntry(props: { card: LocalizedThanksCard }) {
  return (
    <Show
      when={props.card.url}
      fallback={<div class="special-thanks-card"><ThanksCardInner card={props.card} /></div>}
    >
      <a class="special-thanks-card special-thanks-link" href={props.card.url} target="_blank" rel="noopener noreferrer" title={props.card.url}>
        <ThanksCardInner card={props.card} />
      </a>
    </Show>
  )
}

export function SpecialPage(props: { lang: Lang }) {
  const c = () => copyFor(props.lang)
  const [special, setSpecial] = createSignal<LocalizedSpecial | null>(null)
  const [failed, setFailed] = createSignal(false)
  const [copied, setCopied] = createSignal(false)
  const [ringIndex, setRingIndex] = createSignal(0)

  createEffect(() => {
    const lang = props.lang
    let cancelled = false
    setSpecial(null)
    setFailed(false)
    fetchSpecial(lang)
      .then((data) => { if (!cancelled) { setSpecial(data); setFailed(false) } })
      .catch(() => { if (!cancelled) setFailed(true) })
    const unsubscribe = subscribeSpecial(lang, (data) => { setSpecial(data); setFailed(false) })
    onCleanup(() => { cancelled = true; unsubscribe() })
  })

  const webring = () => special()?.webring ?? []
  const ringAt = (index: number) => {
    const list = webring()
    if (list.length === 0) return null
    return list[((index % list.length) + list.length) % list.length]
  }
  const step = (delta: number) => setRingIndex((index) => index + delta)
  const openSite = (site: WebringSite | null) => {
    if (site) window.open(site.url, '_blank', 'noopener,noreferrer')
  }
  const randomSite = () => {
    const list = webring()
    if (list.length === 0) return
    openSite(list[Math.floor(Math.random() * list.length)])
  }
  const currentSite = createMemo(() => ringAt(ringIndex()))

  const bannerSrc = () => {
    const html = special()?.bannerHtml ?? ''
    const match = html.match(/src=["']([^"']+)["']/i)
    return match?.[1] ?? ''
  }

  const copyBanner = async () => {
    const code = special()?.bannerHtml ?? ''
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      // clipboard unavailable (insecure context) — ignore
    }
  }

  return (
    <article class="special-page">
      <Show when={special()} fallback={<p class="special-status">{failed() ? c().error : c().loading}</p>}>
        <a class="special-section special-profile special-profile-link" href={PROFILE_URL} target="_blank" rel="noopener noreferrer" aria-label="d7tun6">
          <div class="special-profile-avatar">
            <img src="/media/image/people/d7tun6.webp?v=2" alt="d7tun6" width="160" height="160" loading="lazy" />
          </div>
          <div class="special-profile-body">
            <h2 class="special-nick">d7tun6</h2>
            <p class="special-role">{c().profileRole}</p>
            <p class="special-bio">{special()!.bio}</p>
          </div>
        </a>

        <section class="special-section" aria-label={c().thanksTitle}>
          <h2 class="special-title">[ {c().thanksTitle} ]</h2>
          <Show when={special()!.thanks.length > 0} fallback={<p class="special-status">{c().thanksEmpty}</p>}>
            <div class="special-thanks">
              <For each={special()!.thanks}>
                {(card) => <ThanksCardEntry card={card} />}
              </For>
            </div>
          </Show>
        </section>

        <section class="special-section" aria-label={c().bannerTitle}>
          <h2 class="special-title">[ {c().bannerTitle} ]</h2>
          <div class="special-banner">
            <Show when={bannerSrc()}>
              <img class="special-banner-preview" src={bannerSrc()} alt="d7tun6 88x31" width="88" height="31" />
            </Show>
            <div class="special-embed">
              <p class="special-embed-hint">{c().bannerHint}</p>
              <pre class="special-embed-code">{special()!.bannerHtml}</pre>
              <button type="button" class="shop-btn shop-btn-secondary special-copy" onClick={copyBanner}>
                {copied() ? c().copied : c().copy}
              </button>
            </div>
          </div>
        </section>

        <section class="special-section" aria-label={c().webringTitle}>
          <h2 class="special-title">[ {c().webringTitle} ]</h2>
          <Show when={webring().length > 0} fallback={<p class="special-status">{c().webringEmpty}</p>}>
            <div class="special-webring-nav">
              <button type="button" class="shop-btn shop-btn-secondary" onClick={() => step(-1)}>← {c().prev}</button>
              <button type="button" class="shop-btn special-webring-current" onClick={randomSite}>
                {currentSite()?.name ?? c().random}
              </button>
              <button type="button" class="shop-btn shop-btn-secondary" onClick={() => step(1)}>{c().next} →</button>
            </div>
            <p class="special-webring-hint">{c().webringHint}</p>
            <div class="special-webring-list">
              <For each={webring()}>
                {(site, index) => (
                  <button
                    type="button"
                    class={`special-webring-item${index() === ringIndex() ? ' is-active' : ''}`}
                    onClick={() => { setRingIndex(index()); openSite(site) }}
                    title={site.owner ? `${site.name} — ${site.owner}` : site.name}
                  >
                    <Show when={site.badge}>
                      <img src={site.badge} alt={site.name} width="88" height="31" loading="lazy" />
                    </Show>
                    <span class="special-webring-name">{site.name}</span>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </section>
      </Show>
    </article>
  )
}
