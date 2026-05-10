import manifest from '@/generated/release-manifest.json'
import { compareReleasesByDateDesc } from '@/lib/music'
import type { ReleaseEntry } from '@/types/content'

export type ReleaseManifest = {
  generatedAt: string
  releases: ReleaseEntry[]
}

const typedManifest = manifest as ReleaseManifest

const releaseBySlug = new Map<string, ReleaseEntry>(typedManifest.releases.map((release) => [release.slug, release]))

export const releaseManifest = typedManifest

export function getReleaseRoutes(): string[] {
  return typedManifest.releases.map((release) => `music/${release.slug}`)
}

export function getAllReleases(): ReleaseEntry[] {
  return typedManifest.releases.slice().sort(compareReleasesByDateDesc)
}

export function getReleaseBySlug(slug: string): ReleaseEntry | null {
  return releaseBySlug.get(slug) ?? null
}

export async function fetchLiveManifest(): Promise<ReleaseManifest> {
  const res = await fetch('/api/releases/manifest')
  if (!res.ok) throw new Error(`Failed to fetch manifest: ${res.status}`)
  return res.json() as Promise<ReleaseManifest>
}
