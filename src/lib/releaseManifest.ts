import { createRoot, createSignal } from 'solid-js'
import manifest from '@/generated/release-manifest.json'
import { compareReleasesByDateDesc } from '@/lib/music'
import type { ReleaseEntry, ReleaseManifest } from '@/types/content'

const typedManifest = manifest as ReleaseManifest

// Module-level signal so UI reactively updates when manifest changes
const [manifestSignal, setManifestSignal] = createRoot(() => createSignal<ReleaseManifest>(typedManifest))

// The bundled manifest is a build-time snapshot; refresh from the live API so
// newly added/edited releases show up without waiting for a rebuild.
if (typeof window !== 'undefined') {
  fetchLiveManifest().then(setManifestSignal).catch(() => { /* keep bundled snapshot */ })
}

export function getAllReleases(): ReleaseEntry[] {
  return manifestSignal().releases.slice().sort(compareReleasesByDateDesc)
}

export function getReleaseBySlug(slug: string): ReleaseEntry | null {
  return manifestSignal().releases.find((r) => r.slug === slug) ?? null
}

async function fetchLiveManifest(): Promise<ReleaseManifest> {
  const res = await fetch('/api/releases/manifest')
  if (!res.ok) throw new Error(`Failed to fetch manifest: ${res.status}`)
  return res.json() as Promise<ReleaseManifest>
}

export async function reloadManifest(): Promise<void> {
  const fresh = await fetchLiveManifest()
  setManifestSignal(fresh)
}