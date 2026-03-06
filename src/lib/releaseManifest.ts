import manifest from "@/generated/release-manifest.json";
import type { ReleaseEntry } from "@/types/content";

type ReleaseManifest = {
  generatedAt: string;
  releases: ReleaseEntry[];
};

const typedManifest = manifest as ReleaseManifest;

const releaseBySlug = new Map<string, ReleaseEntry>(
  typedManifest.releases.map((release) => [release.slug, release])
);

export const releaseManifest = typedManifest;

export function getReleaseRoutes(): string[] {
  return typedManifest.releases.map((release) => `music/${release.slug}`);
}

export function getAllReleases(): ReleaseEntry[] {
  return typedManifest.releases;
}

export function getReleaseBySlug(slug: string): ReleaseEntry | null {
  return releaseBySlug.get(slug) ?? null;
}
