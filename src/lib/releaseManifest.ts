import { createRoot, createSignal } from 'solid-js'
import manifest from '@/generated/release-manifest.json'
import { compareReleasesByDateDesc } from '@/lib/music'
import type { ReleaseEntry } from '@/types/content'

export type ReleaseManifest = {
  generatedAt: string
  releases: ReleaseEntry[]
}

const typedManifest = manifest as ReleaseManifest

// Module-level signal so UI reactively updates when manifest changes
const [manifestSignal, setManifestSignal] = createRoot(() => createSignal<ReleaseManifest>(typedManifest))

export const releaseManifest = typedManifest

export function getReleaseRoutes(): string[] {
  return manifestSignal().releases.map((release) => `music/${release.slug}`)
}

export function getAllReleases(): ReleaseEntry[] {
  return manifestSignal().releases.slice().sort(compareReleasesByDateDesc)
}

export function getReleaseBySlug(slug: string): ReleaseEntry | null {
  return manifestSignal().releases.find((r) => r.slug === slug) ?? null
}

export async function fetchLiveManifest(): Promise<ReleaseManifest> {
  const res = await fetch('/api/releases/manifest')
  if (!res.ok) throw new Error(`Failed to fetch manifest: ${res.status}`)
  return res.json() as Promise<ReleaseManifest>
}

export async function reloadManifest(): Promise<void> {
  const fresh = await fetchLiveManifest()
  setManifestSignal(fresh)
}
