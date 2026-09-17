import { createSignal, For, Show, onMount, onCleanup } from 'solid-js'
import { X, SlidersHorizontal, Radio, Sparkles, Settings2, Search, RotateCcw, SkipForward } from 'lucide-solid'
import { getLocaleDictionarySync, t as tt } from '@/lib/i18n'
import {
  getAudioEngine,
  EQ_FREQUENCIES,
  type EqPresetName,
  type Quality,
  type ProfileFilter,
  type CassetteType,
  type DeckType,
} from '@/lib/audio/audio-engine'
import type { Lang } from '@/types/content'

type Tab = 'quality' | 'equalizer' | 'effects'

type EqSearchResult = { brand: string; model: string; path: string }

const QUALITY_OPTIONS: { value: Quality; label: string; desc: string }[] = [
  { value: 'extreme_lobit', label: 'Extreme Lo-bit', desc: '32kbps mono — extreme compression' },
  { value: 'low', label: 'Low', desc: '64kbps — minimal bandwidth' },
  { value: 'medium', label: 'Medium', desc: '128kbps — balanced' },
  { value: 'high', label: 'High', desc: '192kbps — high fidelity' },
  { value: 'superb', label: 'Superb', desc: 'Lossless FLAC' },
]

const EQ_PRESET_OPTIONS: { value: EqPresetName; label: string }[] = [
  { value: 'techno', label: 'Techno' },
  { value: 'enhanced-bass', label: 'Enhanced Bass' },
  { value: 'enhanced-bass-treble', label: 'Bass + Treble' },
  { value: 'enhanced-treble', label: 'Enhanced Treble' },
  { value: 'd7tun6-low-mid-scoop', label: 'D7TUN6 Low Mid Scoop' },
  { value: 'laptop-speakers', label: 'Laptop Speakers' },
  { value: 'live', label: 'Live' },
  { value: 'large-hall', label: 'Large Hall' },
  { value: 'manual', label: 'Manual' },
]

const CASSETTE_OPTIONS: { value: CassetteType; label: string; desc: string }[] = [
  { value: 'type_i', label: 'Type I', desc: 'Normal — warm, low headroom' },
  { value: 'type_ii', label: 'Type II', desc: 'Chrome — brighter, lower noise' },
  { value: 'type_iii', label: 'Type III', desc: 'Ferro-Chrome — mid emphasis' },
  { value: 'type_iv', label: 'Type IV', desc: 'Metal — highest fidelity' },
]

const DECK_OPTIONS: { value: DeckType; label: string; desc: string }[] = [
  { value: 'chinese_walkman', label: 'Chinese Walkman', desc: '$15 no-name — extreme wow & hiss' },
  { value: 'tanashin', label: 'Tanashin', desc: '90s boombox OEM — worn mechanism' },
  { value: 'technics', label: 'Technics', desc: 'Hi-Fi standard — quartz lock' },
  { value: 'nakamichi', label: 'Nakamichi', desc: 'Reference Dragon — dual capstan' },
]

const TAB_ICONS: Record<Tab, typeof Settings2> = {
  quality: Radio,
  equalizer: SlidersHorizontal,
  effects: Sparkles,
}

function formatFreq(hz: number): string {
  return hz >= 1000 ? `${hz / 1000}k` : `${hz}`
}

export function AudioSettingsPanel(props: { onClose: () => void; lang?: Lang }) {
  const engine = getAudioEngine()
  const STORAGE_KEY = 'd7tun6-audio-settings'
  const STORAGE_TAB_KEY = 'd7tun6-audio-settings-tab'
  const _locale = () => props.lang ? getLocaleDictionarySync(props.lang) : null
  const _t = (key: string, fallback: string) => tt(_locale()?.audio, key, fallback)

  const savedTab = (() => {
    try {
      const v = localStorage.getItem(STORAGE_TAB_KEY)
      if (v === 'quality' || v === 'equalizer' || v === 'effects') return v as Tab
    } catch { console.warn('Failed to read saved audio settings tab'); }
    return 'equalizer' as Tab
  })()
  const [activeTab, setActiveTab] = createSignal<Tab>(savedTab)
  const [engineState, setEngineState] = createSignal(engine.state)

  const [eqSearchQuery, setEqSearchQuery] = createSignal('')
  const [eqSearchResults, setEqSearchResults] = createSignal<EqSearchResult[]>([])
  const [eqSearching, setEqSearching] = createSignal(false)
  const [eqSearchOpen, setEqSearchOpen] = createSignal(false)
  const [eqSearchError, setEqSearchError] = createSignal<string | null>(null)
  let searchTimer: number | null = null
  let searchInputRef: HTMLInputElement | undefined
  let searchBoxRef: HTMLDivElement | undefined

  let unsub: (() => void) | null = null
  onMount(() => {
    unsub = engine.subscribe((state) => {
      setEngineState(state)
      const toSave = {
        quality: state.quality,
        eqPreset: state.eqPreset,
        eqGains: state.eqGains,
        autoEqModel: state.autoEqModel,
        autoEqFilters: state.autoEqFilters,
        tapeEnabled: state.tapeEnabled,
        tapeSaturation: state.tapeSaturation,
        cassetteType: state.cassetteType,
        tapeBias: state.tapeBias,
        tapeNoise: state.tapeNoise,
        tapeWow: state.tapeWow,
        tapeFlutter: state.tapeFlutter,
        deckMechanism: state.deckMechanism,
        tanashinWear: state.tanashinWear,
        dolbyC: state.dolbyC,
        reverbEnabled: state.reverbEnabled,
        reverbMix: state.reverbMix,
        bitcrusherEnabled: state.bitcrusherEnabled,
        bitDepth: state.bitDepth,
        reduction: state.reduction,
        combEnabled: state.combEnabled,
        combDelayMs: state.combDelayMs,
        combResonance: state.combResonance,
        chorusEnabled: state.chorusEnabled,
        chorusRate: state.chorusRate,
        chorusDepth: state.chorusDepth,
        chorusMix: state.chorusMix,
        delayEnabled: state.delayEnabled,
        delayTime: state.delayTime,
        delayFeedback: state.delayFeedback,
        delayMix: state.delayMix,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
    })
  })
  onCleanup(() => {
    unsub?.()
    if (searchTimer != null) clearTimeout(searchTimer)
  })

  const selectedPreset = () => engineState().eqPreset
  const eqGains = () => engineState().eqGains
  const autoEqModel = () => engineState().autoEqModel
  const hasAutoEq = () => autoEqModel() !== null
  const deck = () => engineState().deckMechanism
  const tapeOn = () => engineState().tapeEnabled

  function handleEqSlider(index: number, value: number) {
    if (hasAutoEq()) return
    const gains = [...engineState().eqGains]
    gains[index] = value
    engine.setEqGains(gains)
  }

  function handlePresetChange(name: EqPresetName) {
    if (hasAutoEq() && name !== 'manual') return
    engine.setEqPreset(name)
  }

  function handleQualityChange(q: Quality) {
    engine.setQuality(q)
  }

  function formatGainLabel(gain: number): string {
    return gain > 0 ? `+${gain}` : `${gain}`
  }

  function onPointerDown(event: PointerEvent) {
    const node = event.target as Node | null
    if (!node || !searchBoxRef) return
    if (searchBoxRef.contains(node)) return
    setEqSearchOpen(false)
  }

  onMount(() => window.addEventListener('pointerdown', onPointerDown))
  onCleanup(() => window.removeEventListener('pointerdown', onPointerDown))

  async function doSearch(q: string) {
    if (!q.trim()) { setEqSearchResults([]); setEqSearchOpen(false); setEqSearchError(null); return }
    setEqSearching(true)
    setEqSearchError(null)
    try {
      const res = await fetch(`/api/eq/search?q=${encodeURIComponent(q)}`)
      if (!res.ok) return
      const data = await res.json() as { results: EqSearchResult[] }
      setEqSearchResults(data.results)
      setEqSearchOpen(data.results.length > 0)
    } catch {
      console.warn('Failed to search EQ presets')
      setEqSearchResults([])
    } finally {
      setEqSearching(false)
    }
  }

  function onSearchInput(value: string) {
    setEqSearchQuery(value)
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = window.setTimeout(() => doSearch(value), 300)
  }

  async function selectAutoEqProfile(entry: EqSearchResult) {
    setEqSearchError(null)
    try {
      const res = await fetch(`/api/eq/profile?id=${encodeURIComponent(entry.path)}`)
      const data = await res.json() as { error?: string; detail?: string; preamp?: number; filters?: ProfileFilter[] }
      if (!res.ok) {
        setEqSearchError(data.error || data.detail || 'Failed to load profile')
        return
      }
      if (data.filters) {
        engine.applyAutoEqProfile(data.filters, data.preamp)
        engine.setAutoEqModel(`${entry.brand} ${entry.model}`)
      }
      setEqSearchQuery('')
      setEqSearchResults([])
      setEqSearchOpen(false)
    } catch (err) {
      setEqSearchError(err instanceof Error ? err.message : 'Network error')
    }
  }

  function resetAutoEq() {
    engine.clearAutoEqFilters()
    setEqSearchQuery('')
    setEqSearchResults([])
    setEqSearchOpen(false)
    setEqSearchError(null)
  }

  function isPresetActive(name: EqPresetName) {
    if (hasAutoEq()) return false
    return selectedPreset() === name
  }

  return (
    <div class="audio-settings-panel" role="dialog" aria-label={_t('heading', 'Audio settings')} tabIndex={-1}>
      <div class="audio-settings-head">
        <h4>{_t('heading', 'Audio Settings')}</h4>
        <button type="button" onClick={() => props.onClose()} aria-label={_t('close', 'Close audio settings')}>
          <X aria-hidden="true" />
        </button>
      </div>

      <div class="audio-settings-tabs" role="tablist">
        <For each={['quality', 'equalizer', 'effects'] as Tab[]}>
          {(tab) => {
            const Icon = TAB_ICONS[tab]
            return (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab() === tab}
                class={`audio-settings-tab${activeTab() === tab ? ' is-active' : ''}`}
                onClick={() => { setActiveTab(tab); localStorage.setItem(STORAGE_TAB_KEY, tab) }}
              >
                <Icon aria-hidden="true" />
                <span>
                  {tab === 'quality' ? _t('tabQuality', 'Quality') : tab === 'equalizer' ? _t('tabEq', 'EQ') : _t('tabEffects', 'Effects')}
                </span>
              </button>
            )
          }}
        </For>
      </div>

      <div class="audio-settings-body">
        <Show when={activeTab() === 'quality'}>
          <div class="audio-settings-section">
            <For each={QUALITY_OPTIONS}>
              {(opt) => (
                <button
                  type="button"
                  class={`audio-settings-option${engineState().quality === opt.value ? ' is-selected' : ''}`}
                  onClick={() => handleQualityChange(opt.value)}
                  aria-pressed={engineState().quality === opt.value}
                >
                  <span class="audio-settings-option-label">{opt.label}</span>
                  <span class="audio-settings-option-desc">{opt.desc}</span>
                </button>
              )}
            </For>
          </div>
          <div class="audio-settings-norm-row">
            <span class="audio-settings-norm-label">{_t('normalization', 'loudness normalization')}</span>
            <div class="audio-settings-norm-presets">
              {(['standard', 'loud', 'off'] as const).map((mode) => (
                <button
                  type="button"
                  class={`audio-settings-eq-preset${engineState().normalizationMode === mode ? ' is-active' : ''}`}
                  onClick={() => engine.setNormalizationMode(mode)}
                  aria-pressed={engineState().normalizationMode === mode}
                >
                  {mode === 'standard' ? 'standard (-14 lufs)' :
                   mode === 'loud' ? 'loud (-11 lufs)' :
                   'off'}
                </button>
              ))}
            </div>
          </div>
        </Show>

        <Show when={activeTab() === 'equalizer'}>
          <div class="audio-settings-autoeq">
            <div class="audio-settings-autoeq-head">
              <span class="audio-settings-autoeq-label">{_t('headphoneComp', 'Headphone Compensation (AutoEQ)')}</span>
              <Show when={hasAutoEq()}>
                <button
                  type="button"
                  class="audio-settings-autoeq-reset"
                  onClick={resetAutoEq}
                  aria-label={_t('resetAutoEq', 'Reset AutoEQ')}
                >
                  <RotateCcw aria-hidden="true" />
                </button>
              </Show>
            </div>
            <div ref={searchBoxRef} class="audio-settings-autoeq-search">
              <Search class="audio-settings-autoeq-search-icon" aria-hidden="true" />
              <input
                ref={searchInputRef}
                type="text"
                class="audio-settings-autoeq-input"
                placeholder={_t('searchHeadphones', 'Search headphone model...')}
                value={eqSearchQuery()}
                onInput={(e) => onSearchInput(e.currentTarget.value)}
                onFocus={() => { if (eqSearchResults().length > 0) setEqSearchOpen(true) }}
                aria-label={_t('searchHeadphones', 'Search headphones')}
                aria-autocomplete="list"
              />
              <Show when={eqSearching()}>
                <span class="audio-settings-autoeq-spinner" />
              </Show>
            </div>
            <Show when={eqSearchError()}>
              <div class="audio-settings-autoeq-error">{eqSearchError()}</div>
            </Show>
            <Show when={eqSearchOpen() && eqSearchResults().length > 0}>
              <div class="audio-settings-autoeq-dropdown" role="listbox">
                <For each={eqSearchResults()}>
                  {(entry) => (
                    <button
                      type="button"
                      class="audio-settings-autoeq-result"
                      onClick={() => selectAutoEqProfile(entry)}
                      role="option"
                    >
                      <span class="audio-settings-autoeq-result-brand">{entry.brand}</span>
                      <span class="audio-settings-autoeq-result-model">{entry.model}</span>
                    </button>
                  )}
                </For>
              </div>
            </Show>
            <Show when={hasAutoEq()}>
              <div class="audio-settings-autoeq-active">
                {_t('autoEqLabel', 'AutoEQ')}: <strong>{autoEqModel()}</strong>
              </div>
            </Show>
          </div>

          <div class="audio-settings-eq-presets">
            <For each={EQ_PRESET_OPTIONS}>
              {(preset) => (
                <button
                  type="button"
                  class={`audio-settings-eq-preset${isPresetActive(preset.value) ? ' is-active' : ''}`}
                  onClick={() => handlePresetChange(preset.value)}
                  aria-pressed={isPresetActive(preset.value)}
                  disabled={hasAutoEq() && preset.value !== 'manual'}
                >
                  {preset.label}
                </button>
              )}
            </For>
          </div>
          <div class="audio-settings-eq-bands">
            <For each={EQ_FREQUENCIES}>
              {(freq, idx) => (
                  <div class="audio-settings-eq-band">
                    <span class="audio-settings-eq-value">{formatGainLabel(eqGains()[idx()])}</span>
                    <input
                      type="range"
                      class={`audio-settings-eq-slider${hasAutoEq() ? ' is-disabled' : ''}`}
                      min="-12"
                      max="12"
                      step="0.5"
                      value={eqGains()[idx()]}
                      disabled={hasAutoEq()}
                      onInput={(e) => handleEqSlider(idx(), Number(e.currentTarget.value))}
                      aria-label={`${freq}Hz`}
                    />
                    <span class="audio-settings-eq-freq">{formatFreq(freq)}</span>
                  </div>
                )}
            </For>
          </div>
        </Show>

        <Show when={activeTab() === 'effects'}>
          <div class="audio-settings-utils">
            <button
              type="button"
              class={`audio-settings-util-btn${engine.killSwitch ? ' is-danger' : ''}`}
              onClick={() => engine.toggleKillSwitch()}
              aria-pressed={engine.killSwitch}
            >
              {engine.killSwitch ? `${_t('killSwitch', 'Kill Switch')} (ON)` : _t('killSwitch', 'Kill Switch')}
            </button>
            <button
              type="button"
              class="audio-settings-util-btn is-danger"
              onClick={() => engine.panic()}
            >
              {_t('panic', 'Panic')}
            </button>
          </div>
          <div class="audio-settings-effects">
            {/* Tape Emulation */}
            <div class="audio-settings-effect">
              <div class="audio-settings-effect-head">
                <span class="audio-settings-effect-label">{_t('tapeEmulation', 'Tape Emulation')}</span>
                <button
                  type="button"
                  class={`audio-settings-toggle${engineState().tapeEnabled ? ' is-on' : ''}`}
                  onClick={() => engine.setTapeEnabled(!engineState().tapeEnabled)}
                  aria-pressed={engineState().tapeEnabled}
                  role="switch"
                >
                  <span class="audio-settings-toggle-knob" />
                </button>
              </div>
            </div>

            <Show when={tapeOn()}>
              {/* Cassette type selector */}
              <div class="audio-settings-cassette-grid">
                <For each={CASSETTE_OPTIONS}>
                  {(opt) => (
                    <button
                      type="button"
                      class={`audio-settings-cassette-type${engineState().cassetteType === opt.value ? ' is-selected' : ''}`}
                      onClick={() => engine.setCassetteType(opt.value)}
                      aria-pressed={engineState().cassetteType === opt.value}
                    >
                      <span class="audio-settings-cassette-type-label">{opt.label}</span>
                      <span class="audio-settings-cassette-type-desc">{opt.desc}</span>
                    </button>
                  )}
                </For>
              </div>

              <div class="audio-settings-cassette-sliders">
                <div class="audio-settings-effect-slider-wrap">
                  <span class="audio-settings-effect-slider-label">{_t('saturation', 'Saturation')}</span>
                  <input
                    type="range"
                    class="audio-settings-effect-slider"
                    min="0"
                    max="1"
                    step="0.05"
                    value={engineState().tapeSaturation}
                    onInput={(e) => engine.setTapeSaturation(Number(e.currentTarget.value))}
                    aria-label={_t('saturation', 'Tape saturation')}
                  />
                </div>

                <div class="audio-settings-effect-slider-wrap">
                  <span class="audio-settings-effect-slider-label">{_t('bias', 'Bias')}</span>
                  <input
                    type="range"
                    class="audio-settings-effect-slider"
                    min="0"
                    max="1"
                    step="0.05"
                    value={engineState().tapeBias}
                    onInput={(e) => engine.setTapeBias(Number(e.currentTarget.value))}
                    aria-label={_t('bias', 'Tape bias')}
                  />
                </div>

                <div class="audio-settings-effect-slider-wrap">
                  <span class="audio-settings-effect-slider-label">{_t('noise', 'Noise')}</span>
                  <input
                    type="range"
                    class="audio-settings-effect-slider"
                    min="0"
                    max="1"
                    step="0.05"
                    value={engineState().tapeNoise}
                    onInput={(e) => engine.setTapeNoise(Number(e.currentTarget.value))}
                    aria-label={_t('noise', 'Tape noise')}
                  />
                </div>

                <div class="audio-settings-effect-slider-wrap">
                  <span class="audio-settings-effect-slider-label">{_t('wow', 'Wow')}</span>
                  <input
                    type="range"
                    class="audio-settings-effect-slider"
                    min="0"
                    max="1"
                    step="0.05"
                    value={engineState().tapeWow}
                    onInput={(e) => engine.setTapeWow(Number(e.currentTarget.value))}
                    aria-label={_t('wow', 'Tape wow (low-frequency pitch variation)')}
                  />
                </div>

                <div class="audio-settings-effect-slider-wrap">
                  <span class="audio-settings-effect-slider-label">{_t('flutter', 'Flutter')}</span>
                  <input
                    type="range"
                    class="audio-settings-effect-slider"
                    min="0"
                    max="1"
                    step="0.05"
                    value={engineState().tapeFlutter}
                    onInput={(e) => engine.setTapeFlutter(Number(e.currentTarget.value))}
                    aria-label="Tape flutter (high-frequency pitch variation)"
                  />
                </div>
              </div>

              {/* Deck Mechanism */}
              <div class="audio-settings-deck">
                <div class="audio-settings-effect-head">
                  <span class="audio-settings-effect-label">{_t('deckMechanism', 'Deck Mechanism')}</span>
                </div>

                <div class="audio-settings-deck-grid">
                  <For each={DECK_OPTIONS}>
                    {(opt) => (
                      <button
                        type="button"
                        class={`audio-settings-deck-card${deck() === opt.value ? ' is-selected' : ''}`}
                        onClick={() => engine.setDeckMechanism(opt.value)}
                        aria-pressed={deck() === opt.value}
                      >
                        <span class="audio-settings-deck-card-label">{opt.label}</span>
                        <span class="audio-settings-deck-card-desc">{opt.desc}</span>
                      </button>
                    )}
                  </For>
                </div>

                <Show when={deck() === 'tanashin'}>
                  <div class="audio-settings-deck-extras">
                    <div class="audio-settings-effect-slider-wrap">
                      <span class="audio-settings-effect-slider-label">{_t('wear', 'Wear')}</span>
                      <input
                        type="range"
                        class="audio-settings-effect-slider"
                        min="0"
                        max="1"
                        step="0.05"
                        value={engineState().tanashinWear}
                        onInput={(e) => engine.setTanashinWear(Number(e.currentTarget.value))}
                        aria-label={_t('wear', 'Tanashin wear')}
                      />
                    </div>
                    <button
                      type="button"
                      class="audio-settings-deck-chew"
                      onClick={() => engine.triggerTapeChew()}
                    >
                      <SkipForward aria-hidden="true" />
                      {_t('chewTape', 'Chew Tape')}
                    </button>
                  </div>
                </Show>

                <Show when={deck() === 'technics'}>
                  <div class="audio-settings-deck-extras">
                    <div class="audio-settings-effect-head">
                      <span class="audio-settings-effect-label">{_t('dolbyC', 'Dolby C')}</span>
                      <button
                        type="button"
                        class={`audio-settings-toggle${engineState().dolbyC ? ' is-on' : ''}`}
                        onClick={() => engine.setDolbyC(!engineState().dolbyC)}
                        aria-pressed={engineState().dolbyC}
                        role="switch"
                      >
                        <span class="audio-settings-toggle-knob" />
                      </button>
                    </div>
                  </div>
                </Show>
              </div>
            </Show>

            {/* Reverb */}
            <div class="audio-settings-effect">
              <div class="audio-settings-effect-head">
                <span class="audio-settings-effect-label">{_t('reverb', 'Reverb')}</span>
                <button
                  type="button"
                  class={`audio-settings-toggle${engineState().reverbEnabled ? ' is-on' : ''}`}
                  onClick={() => engine.setReverbEnabled(!engineState().reverbEnabled)}
                  aria-pressed={engineState().reverbEnabled}
                  role="switch"
                >
                  <span class="audio-settings-toggle-knob" />
                </button>
              </div>
              <div class="audio-settings-effect-slider-wrap">
                <span class="audio-settings-effect-slider-label">{_t('wetDry', 'Wet / Dry')}</span>
                <input
                  type="range"
                  class="audio-settings-effect-slider"
                  min="0"
                  max="1"
                  step="0.05"
                  value={engineState().reverbMix}
                  onInput={(e) => engine.setReverbMix(Number(e.currentTarget.value))}
                  aria-label="Reverb mix"
                />
              </div>
            </div>

            {/* ── Lo-fi FX ── */}
            <div style="font-family:var(--font-display);font-size:0.75rem;font-weight:900;letter-spacing:0.12em;text-transform:uppercase;opacity:0.6;margin-top:6px">{_t('lofiFx', 'Lo-fi FX')}</div>

            <div class="audio-settings-effect">
              <div class="audio-settings-effect-head">
                <span class="audio-settings-effect-label">{_t('bitcrusher', 'Bitcrusher')}</span>
                <button
                  type="button"
                  class={`audio-settings-toggle${engineState().bitcrusherEnabled ? ' is-on' : ''}`}
                  onClick={() => engine.setBitcrusherEnabled(!engineState().bitcrusherEnabled)}
                  aria-pressed={engineState().bitcrusherEnabled}
                  role="switch"
                >
                  <span class="audio-settings-toggle-knob" />
                </button>
              </div>
              <div class="audio-settings-effect-slider-wrap">
                <span class="audio-settings-effect-slider-label">{_t('bitDepth', 'Bit depth')}</span>
                <input
                  type="range"
                  class="audio-settings-effect-slider"
                  min="2"
                  max="16"
                  step="1"
                  value={engineState().bitDepth}
                  onInput={(e) => engine.setBitDepth(Number(e.currentTarget.value))}
                  aria-label={_t('bitDepth', 'Bit depth')}
                />
              </div>
              <div class="audio-settings-effect-slider-wrap">
                <span class="audio-settings-effect-slider-label">{_t('reduction', 'Reduction')}</span>
                <input
                  type="range"
                  class="audio-settings-effect-slider"
                  min="1"
                  max="20"
                  step="1"
                  value={engineState().reduction}
                  onInput={(e) => engine.setReduction(Number(e.currentTarget.value))}
                  aria-label={_t('reduction', 'Sample rate reduction')}
                />
              </div>
            </div>

            <div class="audio-settings-effect">
              <div class="audio-settings-effect-head">
                <span class="audio-settings-effect-label">{_t('combFilter', 'Comb Filter')}</span>
                <button
                  type="button"
                  class={`audio-settings-toggle${engineState().combEnabled ? ' is-on' : ''}`}
                  onClick={() => engine.setCombEnabled(!engineState().combEnabled)}
                  aria-pressed={engineState().combEnabled}
                  role="switch"
                >
                  <span class="audio-settings-toggle-knob" />
                </button>
              </div>
              <div class="audio-settings-effect-slider-wrap">
                <span class="audio-settings-effect-slider-label">{_t('delayMs', 'Delay (ms)')}</span>
                <input
                  type="range"
                  class="audio-settings-effect-slider"
                  min="1"
                  max="15"
                  step="0.5"
                  value={engineState().combDelayMs}
                  onInput={(e) => engine.setCombDelayMs(Number(e.currentTarget.value))}
                  aria-label={_t('delayMs', 'Comb delay ms')}
                />
              </div>
              <div class="audio-settings-effect-slider-wrap">
                <span class="audio-settings-effect-slider-label">{_t('resonance', 'Resonance')}</span>
                <input
                  type="range"
                  class="audio-settings-effect-slider"
                  min="0"
                  max="0.98"
                  step="0.02"
                  value={engineState().combResonance}
                  onInput={(e) => engine.setCombResonance(Number(e.currentTarget.value))}
                  aria-label={_t('resonance', 'Comb resonance')}
                />
              </div>
            </div>

            <div class="audio-settings-effect">
              <div class="audio-settings-effect-head">
                <span class="audio-settings-effect-label">{_t('chorus', 'Chorus')}</span>
                <button
                  type="button"
                  class={`audio-settings-toggle${engineState().chorusEnabled ? ' is-on' : ''}`}
                  onClick={() => engine.setChorusEnabled(!engineState().chorusEnabled)}
                  aria-pressed={engineState().chorusEnabled}
                  role="switch"
                >
                  <span class="audio-settings-toggle-knob" />
                </button>
              </div>
              <div class="audio-settings-effect-slider-wrap">
                <span class="audio-settings-effect-slider-label">{_t('rate', 'Rate')}</span>
                <input
                  type="range"
                  class="audio-settings-effect-slider"
                  min="0.1"
                  max="2"
                  step="0.05"
                  value={engineState().chorusRate}
                  onInput={(e) => engine.setChorusRate(Number(e.currentTarget.value))}
                  aria-label={_t('rate', 'Chorus rate')}
                />
              </div>
              <div class="audio-settings-effect-slider-wrap">
                <span class="audio-settings-effect-slider-label">{_t('depth', 'Depth')}</span>
                <input
                  type="range"
                  class="audio-settings-effect-slider"
                  min="0"
                  max="1"
                  step="0.05"
                  value={engineState().chorusDepth}
                  onInput={(e) => engine.setChorusDepth(Number(e.currentTarget.value))}
                  aria-label={_t('depth', 'Chorus depth')}
                />
              </div>
              <div class="audio-settings-effect-slider-wrap">
                <span class="audio-settings-effect-slider-label">{_t('mix', 'Mix')}</span>
                <input
                  type="range"
                  class="audio-settings-effect-slider"
                  min="0"
                  max="1"
                  step="0.05"
                  value={engineState().chorusMix}
                  onInput={(e) => engine.setChorusMix(Number(e.currentTarget.value))}
                  aria-label={_t('mix', 'Chorus mix')}
                />
              </div>
            </div>

            <div class="audio-settings-effect">
              <div class="audio-settings-effect-head">
                <span class="audio-settings-effect-label">{_t('dubDelay', 'Dub Delay')}</span>
                <button
                  type="button"
                  class={`audio-settings-toggle${engineState().delayEnabled ? ' is-on' : ''}`}
                  onClick={() => engine.setDelayEnabled(!engineState().delayEnabled)}
                  aria-pressed={engineState().delayEnabled}
                  role="switch"
                >
                  <span class="audio-settings-toggle-knob" />
                </button>
              </div>
              <div class="audio-settings-effect-slider-wrap">
                <span class="audio-settings-effect-slider-label">{_t('time', 'Time')}</span>
                <input
                  type="range"
                  class="audio-settings-effect-slider"
                  min="0.05"
                  max="1.5"
                  step="0.05"
                  value={engineState().delayTime}
                  onInput={(e) => engine.setDelayTime(Number(e.currentTarget.value))}
                  aria-label={_t('time', 'Delay time')}
                />
              </div>
              <div class="audio-settings-effect-slider-wrap">
                <span class="audio-settings-effect-slider-label">{_t('feedback', 'Feedback')}</span>
                <input
                  type="range"
                  class="audio-settings-effect-slider"
                  min="0"
                  max="0.95"
                  step="0.05"
                  value={engineState().delayFeedback}
                  onInput={(e) => engine.setDelayFeedback(Number(e.currentTarget.value))}
                  aria-label={_t('feedback', 'Delay feedback')}
                />
              </div>
              <div class="audio-settings-effect-slider-wrap">
                <span class="audio-settings-effect-slider-label">{_t('mix', 'Mix')}</span>
                <input
                  type="range"
                  class="audio-settings-effect-slider"
                  min="0"
                  max="1"
                  step="0.05"
                  value={engineState().delayMix}
                  onInput={(e) => engine.setDelayMix(Number(e.currentTarget.value))}
                  aria-label={_t('mix', 'Delay mix')}
                />
              </div>
            </div>
          </div>
        </Show>
      </div>
    </div>
  )
}
