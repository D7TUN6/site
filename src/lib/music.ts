import type { ReleaseEntry } from "@/types/content";

export type MusicTag = "lp" | "ep" | "single" | "remaster";

export const MUSIC_TAG_ORDER: MusicTag[] = ["lp", "ep", "single", "remaster"];

const MUSIC_TAG_LABELS: Record<MusicTag, string> = {
  lp: "LP",
  ep: "EP",
  single: "Single",
  remaster: "Remaster"
};

function parseReleaseDate(releaseDate: string): number {
  const match = releaseDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return 0;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  return Date.UTC(year, month - 1, day);
}

export function compareReleasesByDateDesc(a: ReleaseEntry, b: ReleaseEntry): number {
  const delta = parseReleaseDate(b.releaseDate) - parseReleaseDate(a.releaseDate);
  if (delta !== 0) return delta;
  return a.albumName.localeCompare(b.albumName, undefined, { sensitivity: "base", numeric: true });
}

export function getMusicTag(release: ReleaseEntry): MusicTag {
  const albumName = release.albumName.toLowerCase();
  const slug = release.slug.toLowerCase();

  if (albumName.includes("deluxe") || albumName.includes("remaster") || slug.includes("deluxe")) {
    return "remaster";
  }

  if (slug === "wh1te-hous3") {
    return "lp";
  }

  if (slug === "a-path-of-static-snow" || slug === "b-twin") {
    return "ep";
  }

  if (release.tracks.length === 1) {
    return "single";
  }

  if (release.tracks.length <= 4) {
    return "ep";
  }

  return "lp";
}

export function getMusicTagLabel(tag: MusicTag): string {
  return MUSIC_TAG_LABELS[tag];
}

export function groupMusicReleasesByTag(releases: ReleaseEntry[]): Array<{ tag: MusicTag; label: string; releases: ReleaseEntry[] }> {
  const grouped = new Map<MusicTag, ReleaseEntry[]>();

  for (const tag of MUSIC_TAG_ORDER) {
    grouped.set(tag, []);
  }

  for (const release of releases) {
    grouped.get(getMusicTag(release))?.push(release);
  }

  return MUSIC_TAG_ORDER.map((tag) => ({
    tag,
    label: getMusicTagLabel(tag),
    releases: grouped.get(tag) ?? []
  }));
}
