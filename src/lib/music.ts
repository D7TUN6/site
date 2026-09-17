import type { ReleaseEntry } from '@/types/content'

export type MusicTag = 'lp' | 'ep' | 'single' | 'remaster'

export const MUSIC_TAG_ORDER: MusicTag[] = ['lp', 'ep', 'single', 'remaster']

const MUSIC_TAG_LABELS: Record<MusicTag, string> = {
  lp: 'LP',
  ep: 'EP',
  single: 'Single',
  remaster: 'Remaster',
}

function parseReleaseDate(releaseDate: string): number {
  if (!releaseDate) return 0
  // DD/MM/YYYY
  const ddmmyyyy = releaseDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (ddmmyyyy) {
    const day = Number(ddmmyyyy[1])
    const month = Number(ddmmyyyy[2])
    const year = Number(ddmmyyyy[3])
    return Date.UTC(year, month - 1, day)
  }
  // DD/MM/YY
  const ddmmyy = releaseDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/)
  if (ddmmyy) {
    const day = Number(ddmmyy[1])
    const month = Number(ddmmyy[2])
    const year = 2000 + Number(ddmmyy[3])
    return Date.UTC(year, month - 1, day)
  }
  // YYYY-MM-DD
  const isodate = releaseDate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (isodate) {
    const year = Number(isodate[1])
    const month = Number(isodate[2])
    const day = Number(isodate[3])
    return Date.UTC(year, month - 1, day)
  }
  return 0
}

export function compareReleasesByDateDesc(a: ReleaseEntry, b: ReleaseEntry): number {
  const delta = parseReleaseDate(b.releaseDate) - parseReleaseDate(a.releaseDate)
  if (delta !== 0) return delta
  return a.albumName.localeCompare(b.albumName, undefined, { sensitivity: 'base', numeric: true })
}

export function getMusicTag(release: ReleaseEntry): MusicTag {
  // Use releaseType from manifest only if it's explicitly set (not default 'album')
  if (release.releaseType && release.releaseType !== 'album') {
    const normalized = release.releaseType.toLowerCase()
    if (normalized === 'lp') return 'lp'
    if (normalized === 'ep') return 'ep'
    if (normalized === 'single') return 'single'
    if (normalized === 'remaster' || normalized === 'deluxe') return 'remaster'
  }

  const albumName = release.albumName.toLowerCase()
  const slug = release.slug.toLowerCase()

  if (albumName.includes('deluxe') || albumName.includes('remaster') || slug.includes('deluxe')) {
    return 'remaster'
  }

  if (slug === 'wh1te-hous3') {
    return 'lp'
  }

  if (slug === 'a-path-of-static-snow' || slug === 'b-twin') {
    return 'ep'
  }

  if (release.tracks.length === 1) {
    return 'single'
  }

  if (release.tracks.length <= 4) {
    return 'ep'
  }

  return 'lp'
}

export function getMusicTagLabel(tag: MusicTag): string {
  return MUSIC_TAG_LABELS[tag]
}

export function getReleaseTags(release: ReleaseEntry): string[] {
  const out: string[] = []
  const genres = release.genres
  if (genres) {
    for (const t of genres.main ?? []) out.push(t)
    for (const t of genres.sub ?? []) out.push(t)
  }
  if (release.genre.en) out.push(release.genre.en)
  if (release.genre.ru && release.genre.ru !== release.genre.en) out.push(release.genre.ru)
  return out
}

export function releaseMatchesTag(release: ReleaseEntry, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return false
  return getReleaseTags(release).some((t) => t.toLowerCase().includes(q))
}

export function releaseHasTagExact(release: ReleaseEntry, tag: string): boolean {
  const wanted = tag.trim().toLowerCase()
  if (!wanted) return false
  return getReleaseTags(release).some((t) => t.trim().toLowerCase() === wanted)
}

export function groupMusicReleasesByTag(releases: ReleaseEntry[]): Array<{ tag: MusicTag; label: string; releases: ReleaseEntry[] }> {
  const grouped = new Map<MusicTag, ReleaseEntry[]>()

  for (const tag of MUSIC_TAG_ORDER) {
    grouped.set(tag, [])
  }

  for (const release of releases) {
    grouped.get(getMusicTag(release))?.push(release)
  }

  return MUSIC_TAG_ORDER.map((tag) => ({
    tag,
    label: getMusicTagLabel(tag),
    releases: grouped.get(tag) ?? [],
  }))
}
