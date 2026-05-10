import manifest from "@/generated/release-manifest.json";
import { compareReleasesByDateDesc } from "@/lib/music";
import type { ReleaseEntry } from "@/types/content";

type ReleaseManifest = {
  generatedAt: string;
  releases: ReleaseEntry[];
};

const typedManifest = manifest as ReleaseManifest;
const sortedReleases = typedManifest.releases.slice().sort(compareReleasesByDateDesc);

const releaseBySlug = new Map<string, ReleaseEntry>(
  typedManifest.releases.map((release) => [release.slug, release])
);

export const releaseManifest = typedManifest;

export function getReleaseRoutes(): string[] {
  return typedManifest.releases.map((release) => `music/${release.slug}`);
}

export function getAllReleases(): ReleaseEntry[] {
  return sortedReleases.slice();
}

export function getReleaseBySlug(slug: string): ReleaseEntry | null {
  return releaseBySlug.get(slug) ?? null;
}
