import { Show, createResource } from 'solid-js'
import { UiSelect, type UiSelectOption } from '@/components/ui-select'
import { getArtists, type ArtistSummary } from '@/lib/api/artists'
import { SkeletonBlock } from '@/components/skeleton'
import type { Lang } from '@/types/content'

export function ArtistFilterSwitcher(props: {
  lang: Lang
  selectedSlug: string
  onChange: (slug: string) => void
}) {
  const [data] = createResource(getArtists)

  const options = (): UiSelectOption[] => {
    const artists = data()?.artists ?? []
    return [
      { value: '', label: props.lang === 'ru' ? 'все артисты' : 'all artists' },
      ...artists.map((a: ArtistSummary) => ({ value: a.slug, label: a.name })),
    ]
  }

  return (
    <Show
      when={data()}
      fallback={
        <div class="shop-filter">
          <label class="form-field">
            <span class="form-label">{props.lang === 'ru' ? 'артист' : 'artist'}</span>
            <SkeletonBlock height="30px" />
          </label>
        </div>
      }
    >
      <div class="shop-filter">
        <label class="form-field">
          <span class="form-label">{props.lang === 'ru' ? 'артист' : 'artist'}</span>
          <UiSelect
            modelValue={props.selectedSlug}
            options={options()}
            onChange={(v) => props.onChange(v)}
            ariaLabel={props.lang === 'ru' ? 'Артист' : 'Artist'}
          />
        </label>
      </div>
    </Show>
  )
}
