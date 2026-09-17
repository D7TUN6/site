import { Show, createEffect, createResource, createSignal } from 'solid-js'
import { Heart, Download } from 'lucide-solid'
import { getVideoEntries, getVideoEntry, getVideoStats, recordVideoView, toggleVideoLike } from '@/lib/api/video.js'
import { CustomVideoPlayer } from '@/components/VideoPlayer.js'
import { VideoRecommendations } from '@/components/VideoRecommendations.js'
import { SkeletonBlock } from '@/components/skeleton'
import type { Lang } from '@/types/content.js'

export function VideoEntryPage(props: {
  lang: Lang
  slug: string
  navigate: (href: string, event?: MouseEvent) => void
  back: string
}) {
  const [data] = createResource(() => props.slug, (s) => getVideoEntry(s))
  const [stats, setStats] = createSignal<{ totalViews: number; totalLikes: number; userLiked: boolean } | null>(null)
  const [allEntries] = createResource(() => getVideoEntries())
  const [liked, setLiked] = createSignal(false)
  const [likeCount, setLikeCount] = createSignal(0)
  const [viewRecorded, setViewRecorded] = createSignal(false)

  createEffect(() => {
    const d = data()
    if (!d) return
    getVideoStats(d.entry.slug).then((s) => {
      setStats(s)
      setLiked(s.userLiked)
      setLikeCount(s.totalLikes)
    }).catch(() => {})
  })

  createEffect(() => {
    const d = data()
    if (!d || viewRecorded()) return
    const entry = d.entry
    if (!entry.sources.length) return
    setViewRecorded(true)
    recordVideoView(entry.slug, 0, false).catch(() => {})
  })

  function handleTimeUpdate(current: number, duration: number) {
    if (!data()) return
    const pct = duration > 0 ? current / duration : 0
    if (pct >= 0.9 && !viewRecorded()) {
      recordVideoView(data()!.entry.slug, current, true).catch(() => {})
    }
  }

  async function handleLike() {
    const d = data()
    if (!d) return
    try {
      const res = await toggleVideoLike(d.entry.slug)
      setLiked(res.liked)
      setLikeCount((c) => c + (res.liked ? 1 : -1))
    } catch { console.warn('Failed to toggle video like') }
  }

  function handleDownload() {
    const d = data()
    if (!d) return
    const sources = d.entry.sources
    if (sources.length === 0) return
    // Prefer non-HLS source for download (mp4, webm, etc.)
    const source = sources.find((s) => !/mpegurl|m3u8/i.test(s.type)) ?? sources[sources.length - 1]
    const ext = source.type.includes('webm') ? 'webm' : 'mp4'
    const a = document.createElement('a')
    a.href = source.url
    a.download = `${d.entry.slug}${source.resolution ? `-${source.resolution}` : ''}.${ext}`
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  return (
    <Show when={data()} fallback={
      <div class="video-entry-page">
        <div class="video-entry-main">
          <a class="content-link-plain" href={`/${props.lang}/video`} onClick={(e) => props.navigate(`/${props.lang}/video`, e)}>{props.back}</a>
          <div class="video-player-wrap">
            <SkeletonBlock height="0" style={{ 'padding-bottom': '56.25%' }} />
          </div>
          <div class="video-entry-info">
            <SkeletonBlock height="24px" width="60%" style={{ 'margin-bottom': '8px' }} />
            <div style={{ display: 'flex', gap: '8px', 'align-items': 'center' }}>
              <SkeletonBlock height="14px" width="80px" />
              <SkeletonBlock height="14px" width="100px" />
            </div>
          </div>
          <div style={{ 'margin-top': '11px', display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
            <SkeletonBlock height="12px" width="100%" />
            <SkeletonBlock height="12px" width="80%" />
          </div>
        </div>
      </div>
    }>
      {(d) => {
        const entry = () => d().entry
        return (
          <div class="video-entry-page">
            <div class="video-entry-main">
              <a class="content-link-plain" href={`/${props.lang}/video`} onClick={(e) => props.navigate(`/${props.lang}/video`, e)}>{props.back}</a>
              <Show when={entry().sources.length > 0}>
                <div class="video-player-wrap">
                  <CustomVideoPlayer sources={entry().sources} poster={entry().thumbnail || undefined} onTimeUpdate={handleTimeUpdate} />
                </div>
              </Show>

              <div class="video-entry-info">
                <h1 class="video-entry-title">{entry().title}</h1>
                <div class="video-entry-metrics">
                  <span class="video-entry-views">{stats()?.totalViews ?? 0} {props.lang === 'ru' ? 'просмотров' : 'views'}</span>
                  <span class="video-entry-sep">&bull;</span>
                  <span class="video-entry-date">{entry().date}</span>
                  <div class="video-entry-spacer" />
                  <Show when={entry().sources.some((s) => !/mpegurl|m3u8/i.test(s.type))}>
                    <button
                      type="button"
                      class="video-entry-like"
                      onClick={handleDownload}
                      aria-label={props.lang === 'ru' ? 'Скачать видео' : 'Download video'}
                    >
                      <Download size={18} />
                    </button>
                  </Show>
                  <button
                    type="button"
                    class={`video-entry-like${liked() ? ' is-liked' : ''}`}
                    onClick={handleLike}
                    aria-label={props.lang === 'ru' ? 'Лайк' : 'Like'}
                  >
                    <Heart size={18} />
                    <span class="video-entry-like-count">{likeCount()}</span>
                  </button>
                </div>
              </div>

              <Show when={entry().description}>
                <div class="video-entry-desc">
                  <p class="video-entry-desc-text">{entry().description?.replace(/\\n/g, '\n')}</p>
                </div>
              </Show>
            </div>

            <Show when={allEntries()}>
              <VideoRecommendations entries={allEntries()!.entries} currentSlug={entry().slug} lang={props.lang} navigate={props.navigate} />
            </Show>
          </div>
        )
      }}
    </Show>
  )
}
