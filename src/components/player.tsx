import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js'
import { Portal } from 'solid-js/web'
import { Pause, Play, Settings, Download, Lock, Star, Heart } from 'lucide-solid'
import type { Lang, ReleaseEntry, AudioFormat, AudioBitDepth, AudioChannels, AudioResampler, AudioBitrateMode } from '@/types/content'
import { buildPlayerQueueFromRelease } from '@/player/queue'
import { downloadReleaseWithProgress, downloadTrackWithProgress, type DownloadFormatArgs, type DownloadProgressEvent } from '@/lib/releaseDownloads'
import { usePlayer } from '@/features/player/usePlayer'
import { UiSelect, type UiSelectOption } from '@/components/ui-select'
import { isPreOrder, isTrackLocked, parseReleaseDate } from '@/lib/releasePreorder'
import type { LikesData, MetricsData } from '@/lib/api/social'
import { fetchSocialData } from '@/components/player/PlayerSocial'

const FORMATS: AudioFormat[] = ['wav', 'flac', 'ogg-opus', 'ogg-vorbis', 'mp3', 'aiff', 'raw']

const FORMAT_LABELS: Record<AudioFormat, string> = {
  'wav': 'WAV',
  'flac': 'FLAC',
  'ogg-opus': 'Opus',
  'ogg-vorbis': 'Vorbis',
  'mp3': 'MP3',
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

const NORMALIZE_OPTIONS: { value: 'standard' | 'loud' | 'off'; labelEn: string; labelRu: string }[] = [
  { value: 'standard', labelEn: 'Standard (-14 LUFS)', labelRu: 'Станд. (-14 LUFS)' },
  { value: 'loud', labelEn: 'Loud (-11 LUFS)', labelRu: 'Громко (-11 LUFS)' },
  { value: 'off', labelEn: 'Off', labelRu: 'Выкл' },
]

function isLossyFormat(fmt: AudioFormat): boolean {
  return fmt === 'ogg-opus' || fmt === 'ogg-vorbis' || fmt === 'mp3'
}

function isPcmFormat(fmt: AudioFormat): boolean {
  return fmt === 'wav' || fmt === 'aiff' || fmt === 'raw'
}

function needsBitDepth(fmt: AudioFormat): boolean {
  return isPcmFormat(fmt) || fmt === 'flac'
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

export function ReleasePlayer(props: { lang: Lang; release: ReleaseEntry; navigate: (href: string, event?: MouseEvent) => void }) {
  const player = usePlayer()
  let downloadAbort: AbortController | null = null
  onCleanup(() => {
    // The user navigated away mid-download: close the progress stream so the
    // server cancels the conversion instead of burning CPU on tracks nobody
    // will ever receive.
    downloadAbort?.abort()
    downloadAbort = null
  })
  const [downloadError, setDownloadError] = createSignal<string | null>(null)
  const [isDownloading, setIsDownloading] = createSignal(false)
  const [isTrackDownloading, setIsTrackDownloading] = createSignal(false)
  const [downloadPhase, setDownloadPhase] = createSignal<'idle' | 'preparing' | 'converting' | 'zipping' | 'downloading' | 'done' | 'error'>('idle')
  const [downloadTracks, setDownloadTracks] = createSignal<{ index: number; title: string; status: 'pending' | 'converting' | 'done' | 'error'; progress?: number }[]>([])
  const [downloadZipProgress, setDownloadZipProgress] = createSignal(0)
  const [downloadResultMsg, setDownloadResultMsg] = createSignal('')
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
  const [normalize, setNormalize] = createSignal<'standard' | 'loud' | 'off'>('off')
  const [lightboxOpen, setLightboxOpen] = createSignal(false)
  const [coverLoaded, setCoverLoaded] = createSignal(false)

  const [likesData, setLikesData] = createSignal<LikesData | null>(null)
  const [metricsData, setMetricsData] = createSignal<MetricsData | null>(null)
  const [likesLoading, setLikesLoading] = createSignal(true)

  const isRu = createMemo(() => props.lang === 'ru')

  const preOrderActive = createMemo(() => isPreOrder(props.release))
  const preOrderDate = createMemo(() => parseReleaseDate(props.release.releaseDate))
  const preOrderLabel = createMemo(() => {
    const d = preOrderDate()
    if (!d) return ''
    return d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' })
  })

  const socialHidden = createMemo(() => likesData()?.hidden === true || metricsData()?.hidden === true)

  createEffect(() => {
    const slug = props.release.slug
    let cancelled = false
    fetchSocialData(slug).then(({ likesData: l, metricsData: m }) => {
      if (cancelled) return
      setLikesData(l)
      setMetricsData(m)
      setLikesLoading(false)
    }).catch(() => {})
    onCleanup(() => { cancelled = true })
  })

  async function handleAlbumLike() {
    try {
      const { toggleLike } = await import('@/lib/api/social')
      const res = await toggleLike('album', props.release.slug)
      const l = likesData()
      if (l) {
        setLikesData({
          ...l,
          userAlbumLiked: res.liked,
          albumLikes: l.albumLikes + (res.liked ? 1 : -1),
        })
      }
    } catch { console.warn('Failed to toggle album like') }
  }

  async function handleTrackLike(trackIndex: number) {
    try {
      const { toggleLike } = await import('@/lib/api/social')
      const res = await toggleLike('track', props.release.slug, trackIndex)
      const l = likesData()
      if (l) {
        const updated = { ...l.trackLikes }
        const current = updated[trackIndex] || 0
        updated[trackIndex] = Math.max(0, current + (res.liked ? 1 : -1))
        const userLiked = res.liked
          ? [...l.userTrackLiked, trackIndex]
          : l.userTrackLiked.filter((i) => i !== trackIndex)
        setLikesData({ ...l, trackLikes: updated, userTrackLiked: userLiked })
      }
    } catch { console.warn('Failed to toggle track like') }
  }

  // Play tracking: records skip/partial/full listen events per track.
  {
    let lastTrackIndex = -1
    let lastPlayPct = 0
    let trackRecorded = false
    const releaseSlug = createMemo(() => props.release.slug)
    const recordIfNeeded = (slug: string, trackIndex: number, pct: number) => {
      if (trackIndex < 0) return
      const cat = pct >= 0.9 ? 'full' as const : pct >= 0.3 ? 'partial' as const : 'skip' as const
      import('@/lib/api/social').then((m) => m.recordPlay(slug, trackIndex, cat)).catch(() => {})
    }
    createEffect(() => {
      const ct = player.state.currentTime
      const dur = player.state.duration
      if (isActiveQueue() && player.state.playing && dur > 0) {
        lastPlayPct = ct / dur
      }
    })
    createEffect(() => {
      const idx = player.state.currentIndex
      if (isActiveQueue() && idx !== lastTrackIndex) {
        if (!trackRecorded && lastTrackIndex >= 0) recordIfNeeded(releaseSlug(), lastTrackIndex, lastPlayPct)
        lastTrackIndex = idx
        trackRecorded = false
      }
    })
    createEffect(() => {
      const slug = releaseSlug()
      const ct = player.state.currentTime
      const dur = player.state.duration
      if (isActiveQueue() && dur > 0 && ct >= dur - 0.5 && ct > 0 && lastTrackIndex >= 0 && !trackRecorded) {
        import('@/lib/api/social').then((m) => m.recordPlay(slug, lastTrackIndex, 'full')).catch(() => {})
        trackRecorded = true
      }
    })
    onCleanup(() => {
      if (!trackRecorded && lastTrackIndex >= 0 && isActiveQueue()) recordIfNeeded(releaseSlug(), lastTrackIndex, lastPlayPct)
    })
  }

  function trackPlaysForIndex(trackIndex: number): number {
    const tp = metricsData()?.trackPlays
    if (!tp) return 0
    return tp.filter((p) => p.track_index === trackIndex).reduce((acc, p) => acc + p.count, 0)
  }

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
  // The queue must match the CURRENT release data, not just the slug: a queue
  // built before pre-order flags changed (or before a track list edit) has
  // different indices and would map list positions onto the wrong tracks.
  const isActiveQueue = createMemo(() => {
    const q = player.state.queue
    if (!q || q.queueKey !== props.release.slug) return false
    const expected = queuePayload().tracks
    if (q.tracks.length !== expected.length) return false
    return expected.every((track, i) => q.tracks[i]?.index === track.index)
  })
  // Original (1-based) track index of the currently active queue item.
  const activeTrackIndex = createMemo(() => (isActiveQueue() ? (player.state.queue?.tracks[player.state.currentIndex]?.index ?? 0) : 0))
  const currentTrackIndex = createMemo(() => player.state.queue?.tracks[player.state.currentIndex]?.index ?? 0)
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
    bitDepth: needsBitDepth(format()) ? bitDepth() : 16,
    channels: channels(),
    resampler: resampler(),
    bitrateMode: isLossyFormat(format()) ? bitrateMode() : 'vbr',
    bitrate: isLossyFormat(format()) ? bitrate() : 192,
    normalize: normalize(),
  }))

  function toggleMainPlayPause() {
    const payload = queuePayload()
    if (payload.tracks.length === 0) return
    if (!isActiveQueue()) {
      player.setQueue(payload)
      // Big play button: start with the starred main track when it is
      // available, otherwise the first available (unlocked) track.
      const mainPos = payload.tracks.findIndex((t) => t.isMain)
      player.playTrack(mainPos >= 0 ? mainPos : 0)
      return
    }
    player.togglePlayPause()
  }

  function playTrackFromList(index: number) {
    const track = props.release.tracks[index]
    if (!track || isTrackLocked(props.release, track)) return
    // Map the list position onto the queue position: during pre-order the
    // queue only contains unlocked tracks, so indexes diverge.
    const pos = queuePayload().tracks.findIndex((t) => t.index === track.index)
    if (pos < 0) return
    if (!isActiveQueue()) {
      player.setQueue(queuePayload())
      player.playTrack(pos)
      return
    }
    if (pos === player.state.currentIndex) {
      player.togglePlayPause()
      return
    }
    player.playTrack(pos)
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

  function triggerDownload(blob: Blob, filename: string) {
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30000)
  }

  async function handleDownload() {
    setIsDownloading(true)
    setDownloadError(null)
    setDownloadPhase('preparing')
    setDownloadZipProgress(0)
    setDownloadResultMsg('')
    setDownloadTracks([])

    const ac = new AbortController()
    downloadAbort = ac

    const onProgress = (event: DownloadProgressEvent) => {
      if (event.type === 'meta') {
        setDownloadTracks(event.tracks.map((t) => ({ ...t, status: 'pending' as const })))
      } else if (event.type === 'convert-start') {
        setDownloadPhase('converting')
        setDownloadTracks((prev) => prev.map((t) => t.index === event.track ? { ...t, status: 'converting' as const } : t))
      } else if (event.type === 'convert-progress') {
        setDownloadTracks((prev) => prev.map((t) => t.index === event.track ? { ...t, status: 'converting' as const, progress: event.progress } : t))
      } else if (event.type === 'convert-done') {
        setDownloadTracks((prev) => prev.map((t) => t.index === event.track ? { ...t, status: 'done' as const, progress: 1 } : t))
      } else if (event.type === 'zip-progress') {
        setDownloadPhase('zipping')
        setDownloadZipProgress(event.progress)
      } else if (event.type === 'done') {
        setDownloadPhase('downloading')
      } else if (event.type === 'error') {
        setDownloadPhase('error')
        setDownloadResultMsg(event.error)
      }
    }

    try {
      const blob = await downloadReleaseWithProgress(props.release, downloadOpts(), onProgress, ac.signal)
      setDownloadPhase('done')
      setDownloadResultMsg(isRu() ? 'Готово' : 'Done')
      triggerDownload(blob, (blob as Blob & { name?: string }).name || `${props.release.slug}-${format()}.zip`)
    } catch (error) {
      if (ac.signal.aborted) return
      setDownloadPhase('error')
      setDownloadResultMsg(error instanceof Error ? error.message : 'Download failed')
    } finally {
      if (downloadAbort === ac) downloadAbort = null
      setIsDownloading(false)
    }
  }

  async function handleTrackDownload() {
    const track = props.release.tracks.find((t) => t.index === activeTrackIndex())
    if (!track || isTrackLocked(props.release, track)) return
    setIsTrackDownloading(true)
    setDownloadError(null)
    setDownloadPhase('preparing')
    setDownloadResultMsg('')
    setDownloadZipProgress(0)
    setDownloadTracks([])

    const ac = new AbortController()
    downloadAbort = ac

    const onProgress = (event: DownloadProgressEvent) => {
      if (event.type === 'meta') {
        setDownloadTracks([{ index: track.index, title: track.title, status: 'pending' as const }])
      } else if (event.type === 'convert-start') {
        setDownloadPhase('converting')
        setDownloadTracks((prev) => prev.map((t) => t.index === event.track ? { ...t, status: 'converting' as const } : t))
      } else if (event.type === 'convert-done') {
        setDownloadTracks((prev) => prev.map((t) => t.index === event.track ? { ...t, status: 'done' as const } : t))
      } else if (event.type === 'done') {
        setDownloadPhase('downloading')
      } else if (event.type === 'error') {
        setDownloadPhase('error')
        setDownloadResultMsg(event.error)
      }
    }

    try {
      const blob = await downloadTrackWithProgress(props.release, track.index, downloadOpts(), onProgress, ac.signal)
      setDownloadPhase('done')
      setDownloadResultMsg(isRu() ? 'Готово' : 'Done')
      triggerDownload(blob, (blob as Blob & { name?: string }).name || `${props.release.slug}-${track.index}.${format()}`)
    } catch (error) {
      if (ac.signal.aborted) return
      setDownloadPhase('error')
      setDownloadResultMsg(error instanceof Error ? error.message : 'Track download failed')
    } finally {
      if (downloadAbort === ac) downloadAbort = null
      setIsTrackDownloading(false)
    }
  }

  function formatLabelShort(fmt: AudioFormat): string {
    if (fmt === 'wav') return `WAV ${bitDepth()}-bit / ${sampleRate()}Hz`
    if (fmt === 'flac') return `FLAC ${bitDepth()}-bit / ${sampleRate()}Hz`
    if (fmt === 'aiff') return `AIFF ${bitDepth()}-bit / ${sampleRate()}Hz`
    if (fmt === 'raw') return `RAW PCM ${bitDepth()}-bit / ${sampleRate()}Hz`
    if (fmt === 'ogg-opus') return `Opus ${bitrate()}k ${bitrateMode().toUpperCase()} / ${sampleRate()}Hz`
    if (fmt === 'ogg-vorbis') return `Vorbis ${bitrate()}k ${bitrateMode().toUpperCase()} / ${sampleRate()}Hz`
    return `MP3 ${bitrate()}k ${bitrateMode().toUpperCase()} / ${sampleRate()}Hz`
  }

  function trackLinks(track: ReleaseEntry['tracks'][number]) {
    const l = track.links || {}
    return (['spotify', 'yandexMusic', 'bandcamp', 'soundcloud'] as const)
      .map((key) => ({ key, url: l[key] }))
      .filter((x) => x.url)
  }

  return (
    <section class="release-player" aria-label={`${props.release.albumName} player`}>
      <Portal>
        <Show when={isDownloading() || isTrackDownloading()}>
          <div class="release-download-modal" role="status" aria-live="polite">
          <div class="release-download-modal-card">
            <Show when={downloadPhase() === 'error'}>
              <div class="release-download-modal-icon-error">✕</div>
              <p>{downloadResultMsg()}</p>
              <button type="button" class="shop-btn" onClick={() => { setDownloadPhase('idle'); setDownloadResultMsg('') }}>
                {isRu() ? 'Закрыть' : 'Close'}
              </button>
            </Show>
            <Show when={downloadPhase() !== 'error'}>
              <Show when={downloadPhase() === 'done'}>
                <div class="release-download-modal-icon-success">✓</div>
                <p>{downloadResultMsg()}</p>
              </Show>
              <Show when={downloadPhase() !== 'done'}>
                <div class="release-download-spinner" />
                <p>
                  {downloadPhase() === 'preparing' && (isRu() ? 'Подготовка...' : 'Preparing...')}
                  {downloadPhase() === 'converting' && (isRu() ? 'Конвертируем...' : 'Converting...')}
                  {downloadPhase() === 'zipping' && (isRu() ? 'Упаковываем...' : 'Zipping...')}
                  {downloadPhase() === 'downloading' && (isRu() ? 'Скачиваем...' : 'Downloading...')}
                </p>
              </Show>
              <Show when={downloadTracks().length > 0}>
                <div class="release-download-modal-tracks">
                  <For each={downloadTracks()}>
                    {(track) => (
                      <div class="release-download-modal-track">
                        <span class="release-download-modal-track-idx">{track.index + 1}</span>
                        <span class="release-download-modal-track-title">{track.title}</span>
                        <span class="release-download-modal-track-status">
                          <Show when={track.status === 'pending'}><span class="release-download-modal-icon-pending">○</span></Show>
                          <Show when={track.status === 'converting'}><span class="release-download-modal-icon-converting">●</span></Show>
                          <Show when={track.status === 'done'}><span class="release-download-modal-icon-done">✓</span></Show>
                          <Show when={track.status === 'error'}><span class="release-download-modal-icon-error">✕</span></Show>
                        </span>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
              <Show when={downloadPhase() === 'zipping'}>
                <div class="release-download-modal-progress">
                  <span style={{ width: `${Math.round(downloadZipProgress() * 100)}%` }} />
                </div>
              </Show>
            </Show>
          </div>
          </div>
        </Show>
      </Portal>

      <div class="release-player-top">
        <div class="progressive-cover release-player-cover-large" style={{ 'background-image': `url(${props.release.coverPreviewUrl || props.release.coverUrl})` }}>
          <img
            src={props.release.coverUrl || props.release.coverPreviewUrl || ''}
            alt={`${props.release.albumName} cover`}
            class="release-player-cover-large-img"
            width="154"
            height="154"
            onLoad={(e) => e.currentTarget.classList.add('loaded')}
            onClick={() => setLightboxOpen(true)}
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
                <div class="release-player-genres">
                  <For each={props.release.genres?.main?.length ? props.release.genres.main : [props.release.genre.en ? (isRu() ? props.release.genre.ru : props.release.genre.en) : 'electronic']}>
                    {(g) => <a class="release-player-genre" href={`/${props.lang}/music/tag/${encodeURIComponent(g)}`} onClick={(e) => props.navigate(`/${props.lang}/music/tag/${encodeURIComponent(g)}`, e)}>#{g}</a>}
                  </For>
                </div>
              </div>
              <Show when={!socialHidden() && !likesLoading()}>
                <div class="release-player-social" style="margin-top:5px;display:flex;gap:10px;align-items:center">
                  <Show when={likesData()}>
                    <button
                      type="button"
                      class={`release-player-like-btn${likesData()!.userAlbumLiked ? ' is-liked' : ''}`}
                      onClick={handleAlbumLike}
                      aria-label="Like album"
                    >
                      <Heart size={14} aria-hidden="true" />
                      <span class="release-player-like-count">{likesData()!.albumLikes}</span>
                    </button>
                  </Show>
                  <Show when={metricsData()}>
                    <span class="release-player-metric">
                      <span class="release-player-metric-icon">▶</span>
                      <span class="release-player-metric-count">{metricsData()!.plays.total}</span>
                    </span>
                  </Show>
                </div>
              </Show>
            </div>
          </header>

          <Show when={preOrderActive()}>
            <div class="release-preorder-badge" role="status">
              {isRu()
                ? `ПРЕДЗАКАЗ · релиз ${preOrderLabel()} — доступны только превью-треки`
                : `PRE-ORDER · out ${preOrderLabel()} — only preview tracks are playable`}
            </div>
          </Show>

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
                {(track, index) => {
                  const locked = () => isTrackLocked(props.release, track)
                  const isActive = () => isActiveQueue() && track.index === activeTrackIndex()
                  const isCurrent = () => isActiveQueue() && track.index === currentTrackIndex() && player.state.playing
                  const links = () => trackLinks(track)
                  return (
                    <li classList={{ 'is-active': isActive(), 'is-locked': locked(), 'is-main': track.isMain === true }}>
                      <button
                        type="button"
                        class="release-player-track"
                        onClick={() => playTrackFromList(index())}
                        disabled={locked()}
                        aria-current={isActive() ? 'true' : undefined}
                        aria-label={locked() ? `Locked: ${track.title}` : `Play ${track.title}`}
                      >
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
                          <span class="release-player-thumb-overlay" aria-hidden="true" title={isCurrent() ? 'Pause' : 'Play'}>
                            <Show when={locked()} fallback={
                              <span class={isCurrent() ? 'release-player-icon-pause' : 'release-player-icon-play'} />
                            }>
                              <Lock size={12} />
                            </Show>
                          </span>
                        </span>
                        <span class="release-player-track-name">
                          {index() + 1}. {track.title}
                          <Show when={track.isMain === true}>
                            <Star size={12} class="release-player-track-star" aria-label="Main track" />
                          </Show>
                          <Show when={!socialHidden() && metricsData()}>
                            <span class="release-player-track-plays">{trackPlaysForIndex(track.index)}</span>
                          </Show>
                          <Show when={locked()}>
                            <span class="release-player-track-locked-label">
                              {preOrderDate() ? `available ${preOrderLabel()}` : 'available at release'}
                            </span>
                          </Show>
                        </span>
                      </button>
                      <Show when={!locked() && !socialHidden() && !likesLoading()}>
                        <button
                          type="button"
                          class={`release-player-track-like${likesData()?.userTrackLiked.includes(track.index) ? ' is-liked' : ''}`}
                          onClick={(e) => { e.stopPropagation(); handleTrackLike(track.index) }}
                          aria-label="Like track"
                        >
                          <Heart size={12} aria-hidden="true" />
                          <Show when={(likesData()?.trackLikes[track.index] ?? 0) > 0}>
                            <span class="release-player-track-like-count">{likesData()?.trackLikes[track.index] ?? 0}</span>
                          </Show>
                        </button>
                      </Show>
                      <Show when={links().length > 0}>
                        <span class="release-player-track-links">
                          <For each={links()}>
                            {(l) => (
                              <a
                                class="release-player-track-link"
                                href={l.url!}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={l.key}
                                onClick={(e) => e.stopPropagation()}
                              >{l.key === 'yandexMusic' ? 'YM' : l.key === 'spotify' ? 'SP' : l.key === 'soundcloud' ? 'SC' : 'BC'}</a>
                            )}
                          </For>
                        </span>
                      </Show>
                    </li>
                  )
                }}
              </For>
            </ul>

            <aside class={`release-download-panel${showOptions() ? ' is-expanded' : ''}`} aria-label="Release download">
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

                    <Show when={needsBitDepth(format())}>
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

                    <div class="release-download-normalize">
                      <div class="release-download-normalize-label">
                        <span>{isRu() ? 'Нормализация' : 'Normalize'}</span>
                      </div>
                      <div class="release-download-tabs" style="margin-top:6px;margin-bottom:0">
                        <For each={NORMALIZE_OPTIONS}>
                          {(opt) => (
                            <button
                              type="button"
                              class={`release-download-tab${normalize() === opt.value ? ' is-active' : ''}`}
                              onClick={() => setNormalize(opt.value)}
                            >
                              {isRu() ? opt.labelRu : opt.labelEn}
                            </button>
                          )}
                        </For>
                      </div>
                    </div>
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

      <Show when={props.release.genres?.sub?.length}>
        <div class="release-player-tags">
          <span class="release-player-tags-label">{isRu() ? 'теги' : 'tags'}</span>
          <For each={props.release.genres!.sub}>
            {(tag) => <a class="release-player-genre" href={`/${props.lang}/music/tag/${encodeURIComponent(tag)}`} onClick={(e) => props.navigate(`/${props.lang}/music/tag/${encodeURIComponent(tag)}`, e)}>#{tag}</a>}
          </For>
        </div>
      </Show>

      <Show when={lightboxOpen()}>
        <Portal>
          <div
            class="shop-lightbox"
            ref={(el) => { el?.focus() }}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            aria-label="Cover preview"
            onClick={(e) => { if (e.currentTarget === e.target) setLightboxOpen(false) }}
            onKeyDown={(e) => { if (e.key === 'Escape') setLightboxOpen(false) }}
          >
            <button type="button" class="overlay-close" aria-label="close" onClick={() => setLightboxOpen(false)}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
            <Show when={!coverLoaded()}>
              <div class="overlay-loading" />
            </Show>
            <img class="shop-lightbox-img" src={props.release.coverUrl || props.release.coverPreviewUrl || ''} alt={`${props.release.albumName} cover`} onLoad={() => setCoverLoaded(true)} />
          </div>
        </Portal>
      </Show>
    </section>
  )
}
