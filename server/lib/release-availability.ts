import type { ManifestRelease, ManifestTrack } from './release-download-types.js'

export function parseReleaseDate(date?: string): Date | null {
  if (!date) return null
  const m = String(date).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2]) - 1
  const year = Number(m[3])
  const d = new Date(year, month, day)
  // Guard against JS Date rollover ("99/99/2027" would silently wrap).
  if (Number.isNaN(d.getTime()) || d.getDate() !== day || d.getMonth() !== month) return null
  return d
}

// A release counts as pre-order until the start of its release date (server
// local time) — it flips to fully released at 00:00 of that day.
export function isPreOrder(release: Pick<ManifestRelease, 'releaseDate'>): boolean {
  const d = parseReleaseDate(release.releaseDate)
  if (!d) return false
  return d.getTime() > Date.now()
}

export function isTrackLocked(
  release: Pick<ManifestRelease, 'releaseDate'>,
  track: Partial<ManifestTrack>,
): boolean {
  if (!isPreOrder(release)) return false
  return track.previewable === false
}
