import { For, Show, createMemo, createSignal } from 'solid-js'
import { Pause, Play, Settings, Download } from 'lucide-solid'
import type { Lang, ReleaseEntry, AudioFormat, AudioBitDepth, AudioChannels, AudioResampler, AudioBitrateMode } from '@/types/content'
import { buildPlayerQueueFromRelease } from '@/player/queue'
import { downloadRelease, downloadTrack, type DownloadFormatArgs } from '@/lib/releaseDownloads'
import { usePlayer } from '@/features/player/usePlayer'
import { UiSelect, type UiSelectOption } from '@/components/ui-select'

const FORMATS: AudioFormat[] = ['wav', 'flac', 'ogg-opus', 'ogg-vorbis', 'aiff', 'raw']

const FORMAT_LABELS: Record<AudioFormat, string> = {
  'wav': 'WAV',
  'flac': 'FLAC',
  'ogg-opus': 'Opus',
  'ogg-vorbis': 'Vorbis',
  'aiff': 'AIFF',
  'raw': 'RAW PCM',
}

const SAMPLE_RATES = [8000, 11025, 16000, 22050, 32000, 44100, 48000, 88200, 96000, 176400, 192000]

const BIT_DEPTHS: AudioBitDepth[] = [8, 16, 24, 32, 64]

const CHANNEL_OPTIONS: { value: AudioChannels; label: string }[] = [
  { value: 1, label: 'Mono' },
  { value: 2, label: 'Stereo' },
  { value: 4, label: 'Quad' },
  { value: 8, label: '8.0' },
]

const RESAMPLER_OPTIONS: { value: AudioResampler; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'sinc', label: 'Sinc (SoX)' },
  { value: 'r8brain', label: 'r8brain free' },
]

const BITRATE_MODE_OPTIONS: { value: AudioBitrateMode; label: string }[] = [
  { value: 'vbr', label: 'VBR' },
  { value: 'cbr', label: 'CBR' },
]

const BITRATE_OPTIONS = [64, 96, 112, 128, 160, 192, 224, 256, 320, 512]

function isLossyFormat(fmt: AudioFormat): boolean {
  return fmt === 'ogg-opus' || fmt === 'ogg-vorbis'
}

function isPcmFormat(fmt: AudioFormat): boolean {
  return fmt === 'wav' || fmt === 'aiff' || fmt === 'raw'
}

function fmtTime(seconds: number | null): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function ratioFromPointer(event: PointerEvent, target: HTMLElement): number {
  const rect = target.getBoundingClientRect()
  if (rect.width <= 0) return 0
  return (event.clientX - rect.left) / rect.width
}

export function ReleasePlayer(props: { lang: Lang; release: ReleaseEntry }) {
  const player = usePlayer()
  const [downloadError, setDownloadError] = createSignal<string | null>(null)
  const [isDownloading, setIsDownloading] = createSignal(false)
  const [isTrackDownloading, setIsTrackDownloading] = createSignal(false)
  const [seekDragRatio, setSeekDragRatio] = createSignal<number | null>(null)
  const [showOptions, setShowOptions] = createSignal(false)
  const [format, setFormat] = createSignal<AudioFormat>('flac')
  const [sampleRate, setSampleRate] = createSignal(44100)
  const [bitDepth, setBitDepth] = createSignal<AudioBitDepth>(16)
  const [channels, setChannels] = createSignal<AudioChannels>(2)
  const [resampler, setResampler] = createSignal<AudioResampler>('none')
  const [bitrateMode, setBitrateMode] = createSignal<AudioBitrateMode>('vbr')
  const [bitrate, setBitrate] = createSignal(320)
  const [customSr, setCustomSr] = createSignal('')
  const [showCustomSrInput, setShowCustomSrInput] = createSignal(false)
  const [activeTab, setActiveTab] = createSignal<'basic' | 'advanced'>('basic')

  const maxSampleRate = createMemo(() => {
    const track = props.release.tracks[0]
    return track?.sourceSampleRate ?? 192000
  })

  const filteredSampleRates = createMemo(() =>
    SAMPLE_RATES.filter((sr) => sr <= maxSampleRate())
  )

  const formatOptions = createMemo<UiSelectOption[]>(() => 
    FORMATS.map((fmt) => ({ value: fmt, label: FORMAT_LABELS[fmt] }))
  )

  const sampleRateOptions = createMemo<UiSelectOption[]>(() => [
    ...filteredSampleRates().map((sr) => ({ value: String(sr), label: `${sr} Hz` })),
    { value: 'custom', label: isRu() ? 'Своё...' : 'Custom...' },
  ])

  const channelsOptions = createMemo<UiSelectOption[]>(() =>
    CHANNEL_OPTIONS.map((ch) => ({ value: String(ch.value), label: ch.label }))
  )

  const bitDepthOptions = createMemo<UiSelectOption[]>(() =>
    BIT_DEPTHS.map((bd) => ({ value: String(bd), label: `${bd}-bit` }))
  )

  const resamplerOptions = createMemo<UiSelectOption[]>(() =>
    RESAMPLER_OPTIONS.map((rs) => ({ value: rs.value, label: rs.label }))
  )

  const bitrateModeOptions = createMemo<UiSelectOption[]>(() =>
    BITRATE_MODE_OPTIONS.map((bm) => ({ value: bm.value, label: bm.label }))
  )

  const bitrateOptions = createMemo<UiSelectOption[]>(() =>
    BITRATE_OPTIONS.map((br) => ({ value: String(br), label: `${br} kbps` }))
  )

  const queuePayload = createMemo(() => buildPlayerQueueFromRelease(props.release, props.lang))
  const isRu = createMemo(() => props.lang === 'ru')
  const isActiveQueue = createMemo(() => player.state.queue?.queueKey === props.release.slug)
  const activeIndex = createMemo(() => (isActiveQueue() ? player.state.currentIndex : 0))
  const activePosition = createMemo(() => (isActiveQueue() ? player.state.currentTime : 0))
  const activeDuration = createMemo(() => (isActiveQueue() ? player.state.duration : 0))
  const progress = createMemo(() => {
    if (!activeDuration()) return 0
    return Math.max(0, Math.min(100, (activePosition() / activeDuration()) * 100))
  })
  const buffered = createMemo(() => {
    if (!isActiveQueue() || !activeDuration()) return 0
    const value = (player.state.bufferedTime / activeDuration()) * 100
    return Math.max(0, Math.min(100, value))
  })
  const displayProgress = createMemo(() => {
    const drag = seekDragRatio()
    if (drag == null) return progress()
    return Math.max(0, Math.min(100, drag * 100))
  })
  const displayPosition = createMemo(() => {
    const drag = seekDragRatio()
    if (drag == null) return fmtTime(activePosition())
    return fmtTime(activeDuration() * drag)
  })

  const downloadOpts = createMemo((): DownloadFormatArgs => ({
    format: format(),
    sampleRate: showCustomSrInput() ? Number(customSr()) || sampleRate() : sampleRate(),
    bitDepth: isPcmFormat(format()) ? bitDepth() : 16,
    channels: channels(),
    resampler: resampler(),
    bitrateMode: isLossyFormat(format()) ? bitrateMode() : 'vbr',
    bitrate: isLossyFormat(format()) ? bitrate() : 192,
  }))

  function toggleMainPlayPause() {
    if (queuePayload().tracks.length === 0) return
    if (!isActiveQueue()) {
      player.setQueue(queuePayload())
      player.playTrack(0)
      return
    }
    player.togglePlayPause()
  }

  function playTrackFromList(index: number) {
    if (!queuePayload().tracks[index]) return
    if (!isActiveQueue()) {
      player.setQueue(queuePayload())
      player.playTrack(index)
      return
    }
    if (index === player.state.currentIndex) {
      player.togglePlayPause()
      return
    }
    player.playTrack(index)
  }

  function onTimelinePointerDown(event: PointerEvent) {
    if (!isActiveQueue() || !activeDuration()) return
    if (typeof event.button === 'number' && event.button !== 0) return
    const target = event.currentTarget as HTMLElement
    try {
      target.setPointerCapture(event.pointerId)
    } catch { /* ok */ }
    const ratio = clamp01(ratioFromPointer(event, target))
    setSeekDragRatio(ratio)
    player.seekByRatio(ratio)
  }

  function onTimelinePointerMove(event: PointerEvent) {
    const current = seekDragRatio()
    if (current == null) return
    const target = event.currentTarget as HTMLElement
    const ratio = clamp01(ratioFromPointer(event, target))
    setSeekDragRatio(ratio)
    player.seekByRatio(ratio)
  }

  function onTimelinePointerUp(event: PointerEvent) {
    const current = seekDragRatio()
    if (current == null) return
    const target = event.currentTarget as HTMLElement
    try {
      target.releasePointerCapture(event.pointerId)
    } catch { /* ok */ }
    setSeekDragRatio(null)
  }

  async function handleDownload() {
    setIsDownloading(true)
    setDownloadError(null)
    try {
      await downloadRelease(props.release, downloadOpts())
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : 'Unexpected download error')
    } finally {
      setIsDownloading(false)
    }
  }

  async function handleTrackDownload() {
    const track = props.release.tracks[activeIndex()]
    if (!track) return
    setIsTrackDownloading(true)
    setDownloadError(null)
    try {
      await downloadTrack(props.release, track.index, downloadOpts())
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : 'Unexpected track download error')
    } finally {
      setIsTrackDownloading(false)
    }
  }

  function formatLabelShort(fmt: AudioFormat): string {
    if (fmt === 'wav') return `WAV ${bitDepth()}-bit / ${sampleRate()}Hz`
    if (fmt === 'flac') return `FLAC ${bitDepth()}-bit / ${sampleRate()}Hz`
    if (fmt === 'aiff') return `AIFF ${bitDepth()}-bit / ${sampleRate()}Hz`
    if (fmt === 'raw') return `RAW PCM ${bitDepth()}-bit / ${sampleRate()}Hz`
    if (fmt === 'ogg-opus') return `Opus ${bitrate()}k ${bitrateMode().toUpperCase()} / ${sampleRate()}Hz`
    return `Vorbis ${bitrate()}k ${bitrateMode().toUpperCase()} / ${sampleRate()}Hz`
  }

  return (
    <section class="release-player" aria-label={`${props.release.albumName} player`}>
      <Show when={isDownloading()}>
        <div class="release-download-modal" role="status" aria-live="polite">
          <div class="release-download-modal-card">
            <div class="release-download-spinner" />
            <p>{isRu() ? 'Конвертируем...' : 'Converting...'}</p>
          </div>
        </div>
      </Show>

      <div class="release-player-top">
        <div class="progressive-cover release-player-cover-large" style={{ 'background-image': `url(${props.release.coverPreviewUrl || props.release.coverUrl})` }}>
          <img
            src={props.release.coverUrl || props.release.coverPreviewUrl || ''}
            alt={`${props.release.albumName} cover`}
            class="release-player-cover-large-img"
            width="154"
            height="154"
            onLoad={(e) => e.currentTarget.classList.add('loaded')}
          />
        </div>

        <div class="release-player-main">
          <header class="release-player-head">
            <button
              type="button"
              class="release-player-main-btn"
              aria-label={player.state.playing && isActiveQueue() ? 'Pause' : 'Play'}
              onClick={toggleMainPlayPause}
            >
              <Show when={player.state.playing && isActiveQueue()} fallback={<Play class="release-player-main-icon release-player-main-icon-play" />}>
                <Pause class="release-player-main-icon" />
              </Show>
            </button>

            <div class="release-player-meta">
              <div class="release-player-artist">D7TUN6</div>
              <div class="release-player-album">{props.release.albumName}</div>
              <div class="release-player-meta-bottom">
                <div class="release-player-date">{props.release.releaseDate}</div>
                <div class="release-player-genre">#{isRu() ? props.release.genre.ru : props.release.genre.en}</div>
              </div>
            </div>
          </header>

          <div class="release-player-timeline-wrap">
            <div class="release-player-time">{displayPosition()}</div>
            <div
              class={`release-player-timeline${seekDragRatio() !== null ? ' is-dragging' : ''}`}
              role="slider"
              aria-valuemin={0}
              aria-valuemax={Math.max(activeDuration(), 1)}
              aria-valuenow={seekDragRatio() == null ? activePosition() : activeDuration() * seekDragRatio()!}
              onPointerDown={onTimelinePointerDown}
              onPointerMove={onTimelinePointerMove}
              onPointerUp={onTimelinePointerUp}
              onPointerCancel={onTimelinePointerUp}
            >
              <div class="release-player-timeline-buffer" style={{ width: `${buffered()}%` }} />
              <div class="release-player-timeline-fill" style={{ width: `${displayProgress()}%` }} />
              <div class="release-player-timeline-knob" style={{ left: `${displayProgress()}%` }} />
            </div>
            <div class="release-player-time">{fmtTime(activeDuration())}</div>
          </div>

          <div class="release-player-content">
            <ul class="release-player-list">
              <For each={props.release.tracks}>
                {(track, index) => (
                  <li class={isActiveQueue() && index() === activeIndex() ? 'is-active' : undefined}>
                    <button type="button" class="release-player-track" onClick={() => playTrackFromList(index())}>
                      <span class="release-player-thumb-wrap">
                        <div class="progressive-cover" style={{ 'background-image': `url(${props.release.coverPreviewUrl || props.release.coverUrl})` }}>
                          <img
                            src={props.release.coverUrl || props.release.coverPreviewUrl || ''}
                            alt=""
                            class="release-player-thumb"
                            width="28"
                            height="28"
                            onLoad={(e) => e.currentTarget.classList.add('loaded')}
                          />
                        </div>
                        <span class="release-player-thumb-overlay" title={isActiveQueue() && index() === activeIndex() && player.state.playing ? 'Pause' : 'Play'}>
                          <span class={isActiveQueue() && index() === activeIndex() && player.state.playing ? 'release-player-icon-pause' : 'release-player-icon-play'} />
                        </span>
                      </span>
                      <span class="release-player-track-name">{index() + 1}. {track.title}</span>
                    </button>
                  </li>
                )}
              </For>
            </ul>

            <aside class="release-download-panel" aria-label="Release download">
              <div class="release-download-header">
                <h4>{isRu() ? 'Скачать' : 'Download'}</h4>
                <button
                  type="button"
                  class="release-download-toggle"
                  onClick={() => setShowOptions(!showOptions())}
                  aria-label={isRu() ? 'Настройки скачивания' : 'Download settings'}
                >
                  <Settings size={16} />
                </button>
              </div>

              <div class="release-download-preset">
                <span class="release-download-preset-label">{formatLabelShort(format())}</span>
              </div>

              <Show when={showOptions()}>
                <div class="release-download-options">
                  <div class="release-download-tabs">
                    <button
                      type="button"
                      class={`release-download-tab${activeTab() === 'basic' ? ' is-active' : ''}`}
                      onClick={() => setActiveTab('basic')}
                    >
                      {isRu() ? 'Основные' : 'Basic'}
                    </button>
                    <button
                      type="button"
                      class={`release-download-tab${activeTab() === 'advanced' ? ' is-active' : ''}`}
                      onClick={() => setActiveTab('advanced')}
                    >
                      {isRu() ? 'Дополнительно' : 'Advanced'}
                    </button>
                  </div>

                  <Show when={activeTab() === 'basic'}>
                    <label class="form-field">
                      <span class="form-label">{isRu() ? 'Формат' : 'Format'}</span>
                      <UiSelect
                        modelValue={format()}
                        options={formatOptions()}
                        onChange={(v) => setFormat(v as AudioFormat)}
                        ariaLabel={isRu() ? 'Формат' : 'Format'}
                      />
                    </label>

                    <label class="form-field">
                      <span class="form-label">{isRu() ? 'Частота дискретизации' : 'Sample Rate (Hz)'}</span>
                      <UiSelect
                        modelValue={showCustomSrInput() ? 'custom' : String(sampleRate())}
                        options={sampleRateOptions()}
                        onChange={(v) => {
                          if (v === 'custom') {
                            setShowCustomSrInput(true)
                          } else {
                            setShowCustomSrInput(false)
                            setSampleRate(Number(v))
                          }
                        }}
                        ariaLabel={isRu() ? 'Частота дискретизации' : 'Sample Rate'}
                      />
                      <Show when={showCustomSrInput()}>
                        <input
                          type="number"
                          class="form-input"
                          value={customSr()}
                          onInput={(e) => setCustomSr(e.currentTarget.value)}
                          placeholder={isRu() ? 'Введите частоту' : 'Enter sample rate'}
                          min={1}
                          max={maxSampleRate()}
                        />
                        <small class="form-hint">{isRu() ? `Максимум: ${maxSampleRate()} Hz` : `Max: ${maxSampleRate()} Hz`}</small>
                      </Show>
                    </label>

                    <label class="form-field">
                      <span class="form-label">{isRu() ? 'Каналы' : 'Channels'}</span>
                      <UiSelect
                        modelValue={String(channels())}
                        options={channelsOptions()}
                        onChange={(v) => setChannels(Number(v) as AudioChannels)}
                        ariaLabel={isRu() ? 'Каналы' : 'Channels'}
                      />
                    </label>

                    <Show when={isPcmFormat(format())}>
                      <label class="form-field">
                        <span class="form-label">{isRu() ? 'Битность' : 'Bit Depth'}</span>
                        <UiSelect
                          modelValue={String(bitDepth())}
                          options={bitDepthOptions()}
                          onChange={(v) => setBitDepth(Number(v) as AudioBitDepth)}
                          ariaLabel={isRu() ? 'Битность' : 'Bit Depth'}
                        />
                      </label>
                    </Show>
                  </Show>

                  <Show when={activeTab() === 'advanced'}>
                    <label class="form-field">
                      <span class="form-label">{isRu() ? 'Ресемплер' : 'Resampler'}</span>
                      <UiSelect
                        modelValue={resampler()}
                        options={resamplerOptions()}
                        onChange={(v) => setResampler(v as AudioResampler)}
                        ariaLabel={isRu() ? 'Ресемплер' : 'Resampler'}
                      />
                    </label>

                    <Show when={isLossyFormat(format())}>
                      <label class="form-field">
                        <span class="form-label">{isRu() ? 'Режим битрейта' : 'Bitrate Mode'}</span>
                        <UiSelect
                          modelValue={bitrateMode()}
                          options={bitrateModeOptions()}
                          onChange={(v) => setBitrateMode(v as AudioBitrateMode)}
                          ariaLabel={isRu() ? 'Режим битрейта' : 'Bitrate Mode'}
                        />
                      </label>

                      <label class="form-field">
                        <span class="form-label">{isRu() ? 'Битрейт (кбит/с)' : 'Bitrate (kbps)'}</span>
                        <UiSelect
                          modelValue={String(bitrate())}
                          options={bitrateOptions()}
                          onChange={(v) => setBitrate(Number(v))}
                          ariaLabel={isRu() ? 'Битрейт' : 'Bitrate'}
                        />
                      </label>
                    </Show>
                  </Show>
                </div>
              </Show>

              <div class="release-download-buttons">
                <button type="button" class="release-download-btn" disabled={isDownloading()} onClick={handleDownload}>
                  <Download size={16} />
                  {isRu() ? ' ZIP' : ' ZIP'}
                </button>
                <button
                  type="button"
                  class="release-download-btn release-download-btn-secondary"
                  disabled={isTrackDownloading()}
                  onClick={handleTrackDownload}
                >
                  <Download size={16} />
                  {isRu() ? ' Трек' : ' Track'}
                </button>
              </div>
              <Show when={downloadError()}>
                <small class="release-download-error">{downloadError()}</small>
              </Show>
            </aside>
          </div>
        </div>
      </div>
    </section>
  )
}
