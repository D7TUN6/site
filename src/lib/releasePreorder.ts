import type { ReleaseEntry, ReleaseTrack } from '@/types/content'

/**
 * Parse a release date in DD/MM/YYYY format into a Date (local time).
 * Returns null when the value is missing or unparseable.
 */
export function parseReleaseDate(date?: string | null): Date | null {
  if (!date) return null
  // DD/MM/YYYY
  const ddmmyyyy = String(date).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (ddmmyyyy) {
    const day = Number(ddmmyyyy[1])
    const month = Number(ddmmyyyy[2])
    const year = Number(ddmmyyyy[3])
    const d = new Date(year, month - 1, day)
    if (Number.isNaN(d.getTime())) return null
    return d
  }
  // YYYY-MM-DD
  const isodate = String(date).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (isodate) {
    const year = Number(isodate[1])
    const month = Number(isodate[2])
    const day = Number(isodate[3])
    const d = new Date(year, month - 1, day)
    if (Number.isNaN(d.getTime())) return null
    return d
  }
  return null
}

/** True when the release date is in the future (i.e. the release is in pre-order). */
export function isPreOrder(release: Pick<ReleaseEntry, 'releaseDate'>): boolean {
  const d = parseReleaseDate(release.releaseDate)
  if (!d) return false
  return d.getTime() > Date.now()
}

/** A track is locked during pre-order when it is not flagged as previewable. */
export function isTrackLocked(release: Pick<ReleaseEntry, 'releaseDate'>, track: Pick<ReleaseTrack, 'previewable'>): boolean {
  if (!isPreOrder(release)) return false
  return track.previewable === false
}
