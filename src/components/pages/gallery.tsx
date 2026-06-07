import { For, Show, createMemo, createResource, createSignal } from 'solid-js'
import { getGalleryEntries, getGalleryEntry } from '@/lib/api/gallery'
import type { Lang } from '@/types/content'

export function GalleryPage(props: {
  lang: Lang
  navigate: (href: string, event?: MouseEvent) => void
}) {
  const [entries] = createResource(getGalleryEntries)
  const [tagFilter, setTagFilter] = createSignal('all')

  const allTags = createMemo(() => {
    const data = entries()
    if (!data) return []
    const tags = new Set<string>()
    for (const e of data.entries) for (const t of e.tags) tags.add(t)
    return [...tags].sort()
  })

  const filtered = createMemo(() => {
    const data = entries()
    if (!data) return []
    const tag = tagFilter()
    return tag === 'all'
      ? data.entries
      : data.entries.filter((e) => e.tags.includes(tag))
  })

  return (
    <>
      <h1>{props.lang === 'ru' ? 'галерея' : 'gallery'}</h1>
      <Show when={allTags().length > 0}>
        <div class="shop-filters">
          <label class="form-field shop-filter">
            <span class="form-label">{props.lang === 'ru' ? 'теги' : 'tags'}</span>
            <select class="form-input" value={tagFilter()} onChange={(e) => setTagFilter(e.currentTarget.value)}>
              <option value="all">{props.lang === 'ru' ? 'все' : 'all'}</option>
              <For each={allTags()}>{(tag) => <option value={tag}>{tag}</option>}</For>
            </select>
          </label>
        </div>
      </Show>

      <Show when={filtered().length > 0} fallback={<p class="shop-empty">{props.lang === 'ru' ? 'ничего не найдено' : 'nothing found'}</p>}>
        <div class="gallery-grid">
          <For each={filtered()}>
            {(entry) => (
              <div class="gallery-card">
                <a href={`/${props.lang}/gallery/${entry.slug}`} onClick={(e) => props.navigate(`/${props.lang}/gallery/${entry.slug}`, e)}>
                  <img class="gallery-card-cover" src={entry.cover || `/media/gallery/${entry.slug}/${entry.images[0]}`} alt={entry.title} loading="lazy" decoding="async" />
                  <span class="gallery-card-title">{entry.title}</span>
                </a>
              </div>
            )}
          </For>
        </div>
      </Show>
    </>
  )
}

export function GalleryEntryPage(props: {
  lang: Lang
  slug: string
  navigate: (href: string, event?: MouseEvent) => void
  back: string
}) {
  const [data] = createResource(() => props.slug, getGalleryEntry)
  const [lightbox, setLightbox] = createSignal<number | null>(null)

  return (
    <Show when={data()}>
      {(d) => {
        const entry = () => d().entry
        const images = () => entry().images
        return (
          <>
            <a class="content-link-plain" href={`/${props.lang}/gallery`} onClick={(e) => props.navigate(`/${props.lang}/gallery`, e)}>{props.back}</a>
            <h1>{entry().title}</h1>
            <Show when={entry().tags.length > 0}>
              <div class="gallery-tags">
                <For each={entry().tags}>{(tag) => <span class="gallery-tag">{tag}</span>}</For>
              </div>
            </Show>
            <div class="gallery-detail-grid">
              <For each={images()}>
                {(img, i) => (
                  <img class="gallery-detail-img" src={`/media/gallery/${entry().slug}/${img}`} alt="" loading="lazy" decoding="async" onClick={() => setLightbox(i())} />
                )}
              </For>
            </div>
            <Show when={lightbox() !== null}>
              <div class="lightbox-overlay" onClick={() => setLightbox(null)}>
                <div class="lightbox-content" onClick={(e) => e.stopPropagation()}>
                  <button class="lightbox-close" onClick={() => setLightbox(null)}>×</button>
                  <img class="lightbox-image" src={`/media/gallery/${entry().slug}/${images()[lightbox()!]}`} alt="" />
                  <div class="lightbox-nav">
                    <Show when={lightbox()! > 0}>
                      <button class="shop-btn" onClick={() => setLightbox(lightbox()! - 1)}>{'<'}</button>
                    </Show>
                    <span>{lightbox()! + 1} / {images().length}</span>
                    <Show when={lightbox()! < images().length - 1}>
                      <button class="shop-btn" onClick={() => setLightbox(lightbox()! + 1)}>{'>'}</button>
                    </Show>
                  </div>
                </div>
              </div>
            </Show>
          </>
        )
      }}
    </Show>
  )
}
