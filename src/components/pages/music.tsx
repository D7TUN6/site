import { For, Show, createMemo, createSignal } from 'solid-js'
import { compareReleasesByDateDesc, getMusicTag, getMusicTagLabel, groupMusicReleasesByTag, MUSIC_TAG_ORDER } from '@/lib/music'
import { getAllReleases, getReleaseBySlug } from '@/lib/releaseManifest'
import { renderSimpleMarkdown } from '@/lib/simpleMarkdown'
import { ReleasePlayer } from '@/components/player'
import type { Lang } from '@/types/content'
import type { PublicConfig } from '@/lib/api/config'

export function MusicPage(props: {
  lang: Lang
  navigate: (href: string, event?: MouseEvent) => void
  publicConfig?: PublicConfig | null
}) {
  const [musicSearch, setMusicSearch] = createSignal('')
  const [musicCategoryFilter, setMusicCategoryFilter] = createSignal('all')

  const releases = createMemo(() => getAllReleases().slice().sort(compareReleasesByDateDesc))
  const musicCategories = createMemo(() => [...MUSIC_TAG_ORDER])

  const filteredReleaseGroups = createMemo(() => {
    const q = musicSearch().trim().toLowerCase()
    const category = musicCategoryFilter()
    return groupMusicReleasesByTag(releases()).map((group) => ({
      ...group,
      releases: group.releases.filter((r) => {
        if (category !== 'all' && getMusicTag(r) !== category) return false
        if (!q) return true
        return `${r.albumName} ${r.genre.en} ${r.genre.ru}`.toLowerCase().includes(q)
      }),
    })).filter((g) => g.releases.length > 0)
  })

  const banners = createMemo(() => props.publicConfig?.banners?.['music'] ?? [])

  return (
    <>
      <h1>{props.lang === 'ru' ? 'музыка' : 'music'}</h1>
      <Show when={banners().length > 0}>
        <div class="page-banners">
          <For each={banners()}>
            {(banner) => <div class="page-banner" innerHTML={banner.text} />}
          </For>
        </div>
      </Show>
      <div class="shop-filters">
        <label class="form-field shop-filter">
          <span class="form-label">{props.lang === 'ru' ? 'поиск' : 'search'}</span>
          <input class="form-input" value={musicSearch()} onInput={(e) => setMusicSearch(e.currentTarget.value)} />
        </label>
        <label class="form-field shop-filter">
          <span class="form-label">{props.lang === 'ru' ? 'категория' : 'category'}</span>
          <select class="form-input" value={musicCategoryFilter()} onInput={(e) => setMusicCategoryFilter(e.currentTarget.value)}>
            <option value="all">{props.lang === 'ru' ? 'все' : 'all'}</option>
            <For each={musicCategories()}>
              {(category) => <option value={category}>{getMusicTagLabel(category)}</option>}
            </For>
          </select>
        </label>
      </div>
      <Show when={filteredReleaseGroups().length > 0} fallback={<p class="shop-empty">{props.lang === 'ru' ? 'ничего не найдено' : 'nothing found'}</p>}>
        <div class="music-sections">
          <For each={filteredReleaseGroups()}>
            {(group) => (
              <section class="music-section">
                <h2 class="music-section-title">{getMusicTagLabel(group.tag)}{group.releases.length > 1 ? 's' : ''}</h2>
                <div class="music-grid">
                  <For each={group.releases}>
                    {(item) => (
                      <a href={`/${props.lang}/music/${item.slug}`} class="release-card" onClick={(e) => props.navigate(`/${props.lang}/music/${item.slug}`, e)}>
                        <img src={item.coverPreviewUrl || item.coverUrl} alt={item.albumName} class="release-cover" loading="lazy" decoding="async" />
                        <span class="release-title">{item.albumName}</span>
                      </a>
                    )}
                  </For>
                </div>
              </section>
            )}
          </For>
        </div>
      </Show>
    </>
  )
}

export function ReleasePage(props: {
  lang: Lang
  slug: string
  navigate: (href: string, event?: MouseEvent) => void
  musicBack: string
}) {
  const release = createMemo(() => getReleaseBySlug(props.slug))

  return (
    <Show when={release()} fallback={
      <p style="color:var(--muted-color)">{props.lang === 'ru' ? 'Релиз не найден.' : 'Release not found.'}
      <br/><small>{props.slug}</small></p>
    }>
      {(item) => {
        const notesMarkdown = createMemo(() => {
          const notesText = item().notes.trim()
          if (!notesText) {
            const title = props.lang === 'ru' ? 'Заметки' : 'Notes'
            const noNotes = props.lang === 'ru' ? 'Заметки не найдены.' : 'Notes not found.'
            return `## ${title}\n\n${noNotes}`
          }
          return item().notes
        })
        return (
          <>
            <a class="content-link-plain" href={`/${props.lang}/music`} onClick={(e) => props.navigate(`/${props.lang}/music`, e)}>{props.musicBack}</a>
            <ReleasePlayer lang={props.lang} release={item()} />
            <article class="markdown-content" innerHTML={renderSimpleMarkdown(notesMarkdown())} />
          </>
        )
      }}
    </Show>
  )
}
