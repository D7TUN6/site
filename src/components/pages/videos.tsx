import { For, Show, createResource } from 'solid-js'
import { getVideoEntries, getVideoEntry } from '@/lib/api/video'
import type { Lang } from '@/types/content'

export function VideoPage(props: {
  lang: Lang
  navigate: (href: string, event?: MouseEvent) => void
}) {
  const [entries] = createResource(getVideoEntries)

  return (
    <>
      <h1>{props.lang === 'ru' ? 'видео' : 'video'}</h1>
      <Show when={entries() && entries()!.entries.length > 0} fallback={<p class="shop-empty">{props.lang === 'ru' ? 'нет видео' : 'no videos'}</p>}>
        <div class="video-grid">
          <For each={entries()!.entries}>
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

export function VideoEntryPage(props: {
  lang: Lang
  slug: string
  navigate: (href: string, event?: MouseEvent) => void
  back: string
}) {
  const [data] = createResource(() => props.slug, getVideoEntry)

  return (
    <Show when={data()}>
      {(d) => {
        const entry = () => d().entry
        return (
          <>
            <a class="content-link-plain" href={`/${props.lang}/video`} onClick={(e) => props.navigate(`/${props.lang}/video`, e)}>{props.back}</a>
            <h1>{entry().title}</h1>
            <Show when={entry().sources.length > 0}>
              <div class="video-player-wrap">
                <video class="video-player" controls preload="metadata" poster={entry().thumbnail || undefined}>
                  <For each={entry().sources}>
                    {(src) => <source src={src.url} type={src.type} />}
                  </For>
                </video>
              </div>
            </Show>
            <Show when={entry().duration}>
              <p class="video-meta">{props.lang === 'ru' ? 'длительность' : 'duration'}: {Math.floor(entry().duration! / 60)}:{String(entry().duration! % 60).padStart(2, '0')}</p>
            </Show>
          </>
        )
      }}
    </Show>
  )
}
