import { For, createMemo } from 'solid-js'
import type { VideoEntry, Lang } from '@/types/content.js'

export function VideoRecommendations(props: {
  entries: VideoEntry[]
  currentSlug: string
  lang: Lang
  navigate: (href: string, event?: MouseEvent) => void
}) {
  const recs = createMemo(() => props.entries.filter((e) => e.slug !== props.currentSlug).slice(0, 8))
  return (
    <aside class="video-recs">
      <h2 class="video-recs-head">{props.lang === 'ru' ? 'рекомендации' : 'recommendations'}</h2>
      <For each={recs()}>
        {(entry) => (
          <a class="video-recs-card" href={`/${props.lang}/video/${entry.slug}`} onClick={(e) => props.navigate(`/${props.lang}/video/${entry.slug}`, e)}>
            <div class="video-recs-thumb-wrap">
              <img class="video-recs-thumb" src={entry.thumbnail || '/media/video/placeholder.jpg'} alt={entry.title} loading="lazy" />
            </div>
            <div class="video-recs-info">
              <span class="video-recs-title">{entry.title}</span>
              <span class="video-recs-meta">
                {entry.duration ? `${Math.floor(entry.duration / 60)}:${String(entry.duration % 60).padStart(2, '0')}` : ''}
              </span>
            </div>
          </a>
        )}
      </For>
    </aside>
  )
}
