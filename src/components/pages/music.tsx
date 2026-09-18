import { For, Show, createMemo, createSignal } from 'solid-js'
import {
  compareReleasesByDateDesc,
  getMusicTag,
  getMusicTagLabel,
  getReleaseTags,
  groupMusicReleasesByTag,
  MUSIC_TAG_ORDER,
  releaseHasTagExact,
} from '@/lib/music'
import { getAllReleases, getReleaseBySlug } from '@/lib/releaseManifest'
import { cssUrl } from '@/lib/media'
import { renderSimpleMarkdown } from '@/lib/simpleMarkdown'
import { ReleasePlayer } from '@/components/player'
import { UiSelect, type UiSelectOption } from '@/components/ui-select'
import { TagInput } from '@/components/tag-input'
import type { Lang } from '@/types/content'
import type { PublicConfig } from '@/lib/api/config'

export function MusicPage(props: {
  lang: Lang
  navigate: (href: string, event?: MouseEvent) => void
  publicConfig?: PublicConfig | null
}) {
  const [musicSearch, setMusicSearch] = createSignal('')
  const [musicTagFilter, setMusicTagFilter] = createSignal<string[]>([])
  const [musicCategoryFilter, setMusicCategoryFilter] = createSignal('all')
  const [musicArtistFilter, setMusicArtistFilter] = createSignal('')

  const releases = createMemo(() => getAllReleases().slice().sort(compareReleasesByDateDesc))
  const musicCategories = createMemo(() => [...MUSIC_TAG_ORDER])

  const allTags = createMemo(() => {
    const set = new Set<string>()
    for (const r of releases()) {
      for (const t of getReleaseTags(r)) {
        set.add(t.toLowerCase())
      }
    }
    return [...set].sort()
  })

  const tagSuggestions = (query: string): string[] => {
    const q = query.toLowerCase().trim()
    const selected = new Set(musicTagFilter().map((t) => t.toLowerCase()))
    return allTags()
      .filter((t) => !selected.has(t) && (q ? t.includes(q) : true))
      .slice(0, 12)
  }

  const allArtists = createMemo(() => {
    const set = new Set<string>()
    for (const r of releases()) {
      if (r.artist) set.add(r.artist)
    }
    return [...set].sort()
  })

  const categoryOptions = createMemo<UiSelectOption[]>(() => [
    { value: 'all', label: props.lang === 'ru' ? 'все' : 'all' },
    ...musicCategories().map((c) => ({ value: c, label: getMusicTagLabel(c) })),
  ])

  const artistOptions = createMemo<UiSelectOption[]>(() => [
    { value: '', label: props.lang === 'ru' ? 'все артисты' : 'all artists' },
    ...allArtists().map((a) => ({ value: a, label: a })),
  ])

  const filteredReleaseGroups = createMemo(() => {
    const q = musicSearch().trim().toLowerCase()
    const selectedTags = musicTagFilter()
    const category = musicCategoryFilter()
    const artist = musicArtistFilter()
    return groupMusicReleasesByTag(releases()).map((group) => ({
      ...group,
      releases: group.releases.filter((r) => {
        if (category !== 'all' && getMusicTag(r) !== category) return false
        if (artist && r.artist !== artist) return false
        if (selectedTags.length > 0 && !selectedTags.every((t) => releaseHasTagExact(r, t))) return false
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
      <div class="music-filters">
        <label class="form-field music-filter">
          <span class="form-label">{props.lang === 'ru' ? 'поиск' : 'search'}</span>
          <input class="form-input" value={musicSearch()} onInput={(e) => setMusicSearch(e.currentTarget.value)} />
        </label>
        <label class="form-field music-filter">
          <span class="form-label">{props.lang === 'ru' ? 'категория' : 'category'}</span>
          <UiSelect
            modelValue={musicCategoryFilter()}
            options={categoryOptions()}
            onChange={(v) => setMusicCategoryFilter(v)}
            ariaLabel={props.lang === 'ru' ? 'категория' : 'category'}
          />
        </label>
        <div class="form-field music-filter music-filter-wide">
          <TagInput
            label={props.lang === 'ru' ? 'теги' : 'tags'}
            tags={musicTagFilter()}
            onTagsChange={setMusicTagFilter}
            suggestions={tagSuggestions}
            maxTags={10}
            placeholder={props.lang === 'ru' ? 'выберите теги...' : 'choose tags...'}
          />
        </div>
        <Show when={allArtists().length > 0}>
          <label class="form-field music-filter">
            <span class="form-label">{props.lang === 'ru' ? 'артист' : 'artist'}</span>
            <UiSelect
              modelValue={musicArtistFilter()}
              options={artistOptions()}
              onChange={(v) => setMusicArtistFilter(v)}
              ariaLabel={props.lang === 'ru' ? 'артист' : 'artist'}
            />
          </label>
        </Show>
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
                        <div class="progressive-cover release-cover" style={{ 'background-image': cssUrl(item.coverPreviewUrl || item.coverUrl) }}>
                          <img src={item.coverPreviewUrl || item.coverUrl} alt={item.albumName} loading="lazy" decoding="async" onLoad={(e) => e.currentTarget.classList.add('loaded')} />
                        </div>
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

export function MusicTagPage(props: {
  lang: Lang
  tag: string
  navigate: (href: string, event?: MouseEvent) => void
  musicBack: string
}) {
  const items = createMemo(() => getAllReleases()
    .filter((r) => releaseHasTagExact(r, props.tag))
    .slice()
    .sort(compareReleasesByDateDesc))

  return (
    <>
      <a class="content-link-plain" href={`/${props.lang}/music`} onClick={(e) => props.navigate(`/${props.lang}/music`, e)}>{props.musicBack}</a>
      <h1 class="music-tag-heading">#{props.tag}</h1>
      <Show when={items().length > 0} fallback={<p class="shop-empty">{props.lang === 'ru' ? 'Релизов с этим тегом не найдено' : 'No releases with this tag'}</p>}>
        <div class="music-grid">
          <For each={items()}>
            {(item) => (
              <a href={`/${props.lang}/music/${item.slug}`} class="release-card" onClick={(e) => props.navigate(`/${props.lang}/music/${item.slug}`, e)}>
                <div class="progressive-cover release-cover" style={{ 'background-image': cssUrl(item.coverPreviewUrl || item.coverUrl) }}>
                  <img src={item.coverPreviewUrl || item.coverUrl} alt={item.albumName} loading="lazy" decoding="async" onLoad={(e) => e.currentTarget.classList.add('loaded')} />
                </div>
                <span class="release-title">{item.albumName}</span>
              </a>
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
            <ReleasePlayer lang={props.lang} release={item()} navigate={props.navigate} />
            <article class="markdown-content" innerHTML={renderSimpleMarkdown(notesMarkdown())} />
          </>
        )
      }}
    </Show>
  )
}
