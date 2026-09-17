import { For, Show, createMemo, createResource, createSignal } from 'solid-js'
import { getVideoEntries } from '@/lib/api/video.js'
import { ArtistFilterSwitcher } from '@/components/artist-filter-switcher.js'
import { SkeletonBlock } from '@/components/skeleton'
import type { Lang } from '@/types/content.js'

export function VideoPage(props: {
  lang: Lang
  navigate: (href: string, event?: MouseEvent) => void
}) {
  const [videoArtistSlug, setVideoArtistSlug] = createSignal('')
  const [entries] = createResource(videoArtistSlug, (slug) =>
    getVideoEntries(slug || undefined)
  )
  const [videoSearch, setVideoSearch] = createSignal('')

  const filteredEntries = createMemo(() => {
    const data = entries()
    if (!data) return []
    const q = videoSearch().trim().toLowerCase()
    if (!q) return data.entries
    return data.entries.filter((e) => e.title.toLowerCase().includes(q))
  })

  return (
    <>
      <h1>{props.lang === 'ru' ? 'видео' : 'video'}</h1>
      <div class="shop-filters">
        <label class="form-field shop-filter">
          <span class="form-label">{props.lang === 'ru' ? 'поиск' : 'search'}</span>
          <input class="form-input" value={videoSearch()} onInput={(e) => setVideoSearch(e.currentTarget.value)} />
        </label>
        <ArtistFilterSwitcher lang={props.lang} selectedSlug={videoArtistSlug()} onChange={setVideoArtistSlug} />
      </div>
      <Show when={filteredEntries().length > 0} fallback={
        entries.loading ? (
          <div class="video-grid">
            {Array.from({ length: 6 }, () => (
              <div class="video-card" aria-hidden="true">
                <div class="video-thumb-wrap">
                  <SkeletonBlock height="0" style={{ 'padding-bottom': '56.25%' }} />
                </div>
                <span class="video-title" style={{ padding: '5px' }}><SkeletonBlock height="9px" width="85%" /></span>
              </div>
            ))}
          </div>
        ) : (
          <p class="shop-empty">{props.lang === 'ru' ? 'ничего не найдено' : 'nothing found'}</p>
        )
      }>
        <div class="video-grid">
          <For each={filteredEntries()}>
            {(entry) => (
              <a class="video-card" href={`/${props.lang}/video/${entry.slug}`} onClick={(e) => props.navigate(`/${props.lang}/video/${entry.slug}`, e)}>
                <div class="video-thumb-wrap">
                  <img class="video-thumb" src={entry.thumbnail || '/media/video/placeholder.jpg'} alt={entry.title} loading="lazy" decoding="async" />
                  <Show when={entry.duration}>
                    <span class="video-duration">{Math.floor(entry.duration! / 60)}:{String(entry.duration! % 60).padStart(2, '0')}</span>
                  </Show>
                </div>
                <span class="video-title">{entry.title}</span>
              </a>
            )}
          </For>
        </div>
      </Show>
    </>
  )
}
