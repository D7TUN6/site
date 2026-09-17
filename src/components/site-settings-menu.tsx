import { For, onCleanup, onMount } from 'solid-js'
import { X } from 'lucide-solid'
import type { Lang } from '@/types/content'
import type { UiCopy } from '@/lib/uiText'
import type { SiteSettings } from '@/lib/site-settings'
import type { DeviceTier } from '@/lib/perf/tier-detector'

const LANGS: Lang[] = ['en', 'ru']
const TIERS: DeviceTier[] = [0, 1, 2, 3, 4]
const TRIGGER_SELECTOR = '[data-site-settings-trigger]'

export function SiteSettingsMenu(props: {
  settings: SiteSettings
  lang: Lang
  copy: UiCopy
  onPatch: (patch: Partial<SiteSettings>) => void
  onSelectLang: (lang: Lang) => void
  onClose: () => void
}) {
  let rootRef: HTMLDivElement | undefined

  onMount(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null
      if (!target || !rootRef) return
      if (rootRef.contains(target)) return
      if (target instanceof Element && target.closest(TRIGGER_SELECTOR)) return
      props.onClose()
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') props.onClose()
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    onCleanup(() => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    })
  })

  return (
    <div ref={rootRef} class="site-settings-panel" role="dialog" aria-label={props.copy.settingsTitle}>
      <div class="audio-settings-head">
        <h4>{props.copy.settingsTitle}</h4>
        <button type="button" onClick={() => props.onClose()} aria-label={props.copy.settingsTitle}>
          <X aria-hidden="true" />
        </button>
      </div>

      <div class="site-settings-body">
        <section class="site-settings-section">
          <span class="site-settings-label">{props.copy.settingsLanguage}</span>
          <div class="site-settings-grid">
            <For each={LANGS}>
              {(lng) => (
                <button
                  type="button"
                  class={props.lang === lng ? 'is-active' : ''}
                  onClick={() => props.onSelectLang(lng)}
                  aria-pressed={props.lang === lng}
                >
                  {lng.toUpperCase()}
                </button>
              )}
            </For>
          </div>
        </section>

        <section class="site-settings-section">
          <span class="site-settings-label">{props.copy.settingsTheme}</span>
          <div class="site-settings-grid">
            <button
              type="button"
              class={props.settings.theme === 'dark' ? 'is-active' : ''}
              onClick={() => props.onPatch({ theme: 'dark' })}
              aria-pressed={props.settings.theme === 'dark'}
            >
              {props.copy.dark}
            </button>
            <button
              type="button"
              class={props.settings.theme === 'light' ? 'is-active' : ''}
              onClick={() => props.onPatch({ theme: 'light' })}
              aria-pressed={props.settings.theme === 'light'}
            >
              {props.copy.light}
            </button>
          </div>
        </section>

        <section class="site-settings-section">
          <span class="site-settings-label">{props.copy.settingsPerformance}</span>
          <p class="site-settings-desc">{props.copy.settingsPerformanceHint}</p>
          <div class="site-settings-grid site-settings-tier-grid">
            <For each={TIERS}>
              {(tier) => (
                <button
                  type="button"
                  class={props.settings.tier === tier ? 'is-active' : ''}
                  onClick={() => props.onPatch({ tier })}
                  aria-pressed={props.settings.tier === tier}
                >
                  {tier}
                </button>
              )}
            </For>
          </div>
        </section>

        <section class="site-settings-section">
          <div class="site-settings-row">
            <div>
              <span class="site-settings-label">{props.copy.settingsEffects}</span>
              <p class="site-settings-desc">{props.copy.settingsEffectsDesc}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={props.settings.effects}
              aria-label={props.copy.settingsEffects}
              class={`audio-settings-toggle${props.settings.effects ? ' is-on' : ''}`}
              onClick={() => props.onPatch({ effects: !props.settings.effects })}
            >
              <span class="audio-settings-toggle-knob" />
            </button>
          </div>
        </section>

        <section class="site-settings-section">
          <div class="site-settings-row">
            <div>
              <span class="site-settings-label">{props.copy.settingsA11y}</span>
              <p class="site-settings-desc">{props.copy.settingsA11yDesc}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={props.settings.a11y}
              aria-label={props.copy.settingsA11y}
              class={`audio-settings-toggle${props.settings.a11y ? ' is-on' : ''}`}
              onClick={() => props.onPatch({ a11y: !props.settings.a11y })}
            >
              <span class="audio-settings-toggle-knob" />
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}