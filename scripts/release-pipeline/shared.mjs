import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

export const ROOT = process.cwd();
export const MUSIC_ROOT = path.join(ROOT, "public", "media", "music");
export const GENERATED_RELEASE_DATA = path.join(ROOT, "server", "generated", "release-download-data.json");
export const GENERATED_RELEASE_MANIFEST = path.join(ROOT, "src", "generated", "release-manifest.json");
export const RELEASE_MDX_ROOT = path.join(ROOT, "content", "mdx");

export const TRACK_EXT = new Set([".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac"]);
export const COVER_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);
export const URL_PROTOCOL_RE = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;
export const DOWNLOAD_FORMATS = ["flac", "mp3", "ogg", "wav"];
export const DOWNLOAD_FORMATS_BY_SOURCE_EXT = {
  ".wav": ["flac", "mp3", "ogg", "wav"],
  ".flac": ["flac", "mp3", "ogg"],
  ".mp3": ["mp3", "ogg"],
  ".ogg": ["ogg"],
  ".m4a": ["mp3", "ogg"],
  ".aac": ["mp3", "ogg"]
};

export function slugify(value) {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, (m) => ` ${m.slice(1, -1)} `)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

export function toSafeTrackStem(fileName) {
  return slugify(fileName.replace(/\.[^.]+$/, ""));
}

export function getAvailableDownloadFormatsForSourceExt(fileNameOrExt) {
  const ext = fileNameOrExt.startsWith(".") ? fileNameOrExt.toLowerCase() : path.extname(fileNameOrExt).toLowerCase();
  return DOWNLOAD_FORMATS_BY_SOURCE_EXT[ext] ?? ["mp3", "ogg"];
}

export function toPublicUrl(absPath) {
  const rel = path.relative(path.join(ROOT, "public"), absPath);
  const normalized = rel.split(path.sep).join("/");
  return `/${normalized}`;
}

export function normalizeTrackTitle(fileName) {
  const noExt = fileName.replace(/\.[^.]+$/, "");
  return noExt.replace(/^\s*\d+\s*-\s*/, "").trim();
}

export function sortTracksNatural(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export function sortAlbums(a, b) {
  const aDeluxe = /\(deluxe analog edition\)/i.test(a.albumName);
  const bDeluxe = /\(deluxe analog edition\)/i.test(b.albumName);
  const aBase = a.albumName.replace(/\s*\(deluxe analog edition\)\s*/i, "").trim();
  const bBase = b.albumName.replace(/\s*\(deluxe analog edition\)\s*/i, "").trim();
  const byBase = aBase.localeCompare(bBase, undefined, { sensitivity: "base" });
  if (byBase !== 0) return byBase;
  return Number(aDeluxe) - Number(bDeluxe);
}

export async function getAudioDurationSeconds(inputPath) {
  return await new Promise((resolve, reject) => {
    const ffprobe = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      inputPath
    ]);

    const stdout = [];
    const stderr = [];

    ffprobe.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    ffprobe.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));

    ffprobe.on("error", (error) => {
      reject(new Error(`ffprobe failed to start: ${error.message}`));
    });

    ffprobe.on("close", (code) => {
      if (code !== 0) {
        const details = Buffer.concat(stderr).toString("utf8").trim();
        reject(new Error(details || `ffprobe exited with code ${code}`));
        return;
      }

      const value = Buffer.concat(stdout).toString("utf8").trim();
      const duration = Number(value);
      resolve(Number.isFinite(duration) && duration > 0 ? duration : null);
    });
  });
}

export function createEmptyLinks() {
  return {
    spotify: null,
    yandexMusic: null,
    bandcamp: null,
    soundcloud: null
  };
}

export function normalizeLinks(raw) {
  if (!raw || typeof raw !== "object") {
    return createEmptyLinks();
  }

  return {
    spotify: typeof raw.spotify === "string" && raw.spotify.trim() ? raw.spotify.trim() : null,
    yandexMusic:
      typeof raw.yandexMusic === "string" && raw.yandexMusic.trim() ? raw.yandexMusic.trim() : null,
    bandcamp: typeof raw.bandcamp === "string" && raw.bandcamp.trim() ? raw.bandcamp.trim() : null,
    soundcloud: typeof raw.soundcloud === "string" && raw.soundcloud.trim() ? raw.soundcloud.trim() : null
  };
}

export async function readReleaseLinks(albumDir) {
  const filePath = path.join(albumDir, "links.json");
  if (!(await exists(filePath))) {
    return {
      release: createEmptyLinks(),
      tracks: {}
    };
  }

  const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
  const trackMap = {};

  if (parsed?.tracks && typeof parsed.tracks === "object") {
    for (const [key, value] of Object.entries(parsed.tracks)) {
      trackMap[key] = normalizeLinks(value);
    }
  }

  return {
    release: normalizeLinks(parsed?.release),
    tracks: trackMap
  };
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

export function formatDate(date) {
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function normalizeYear(yearRaw) {
  const year = Number(yearRaw);
  if (!Number.isFinite(year)) return null;
  if (yearRaw.length === 2) return 2000 + year;
  return year;
}

export function parseReleaseDateFromNotes(notes) {
  if (!notes) return null;

  const candidates = [
    /(?:^|\n)\s*released\s+(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/im,
    /(?:^|\n)\s*релиз(?:\s+состоялся)?\s+(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/im,
    /(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/
  ];

  for (const re of candidates) {
    const match = notes.match(re);
    if (!match) continue;

    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = normalizeYear(match[3]);

    if (!year) continue;
    if (day < 1 || day > 31 || month < 1 || month > 12) continue;

    return `${pad2(day)}/${pad2(month)}/${year}`;
  }

  return null;
}

export function decodeMaybe(value) {
  try {
    return decodeURI(value);
  } catch {
    return value;
  }
}

export function fallbackTrackTitleFromPlaylistUrl(rawUrl) {
  const stripped = rawUrl.split("#")[0].split("?")[0];

  try {
    if (URL_PROTOCOL_RE.test(stripped)) {
      const url = new URL(stripped);
      const fileName = decodeMaybe(path.basename(url.pathname));
      return normalizeTrackTitle(fileName);
    }
  } catch {
    // Keep fallback below.
  }

  return normalizeTrackTitle(path.basename(decodeMaybe(stripped)));
}

export function normalizePlaylistUrl(rawUrl, playlistPath) {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  if (URL_PROTOCOL_RE.test(trimmed) || trimmed.startsWith("//")) {
    return trimmed;
  }

  if (trimmed.startsWith("/")) {
    return decodeMaybe(trimmed);
  }

  const resolvedAbs = path.resolve(path.dirname(playlistPath), decodeMaybe(trimmed));
  return toPublicUrl(resolvedAbs);
}

export function parsePlaylistEntries(source, playlistPath) {
  const lines = source.split(/\r?\n/);
  const entries = [];
  let pendingTitle = "";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("#EXTINF")) {
      const titleStart = line.indexOf(",");
      pendingTitle = titleStart >= 0 ? line.slice(titleStart + 1).trim() : "";
      continue;
    }

    if (line.startsWith("#")) {
      continue;
    }

    const url = normalizePlaylistUrl(line, playlistPath);
    if (!url) continue;

    entries.push({
      title: pendingTitle || fallbackTrackTitleFromPlaylistUrl(line),
      url
    });
    pendingTitle = "";
  }

  return entries;
}

export async function exists(pathToCheck) {
  try {
    await fs.access(pathToCheck);
    return true;
  } catch {
    return false;
  }
}

export async function readPlaylistEntries(playlistPath) {
  if (!(await exists(playlistPath))) {
    return [];
  }

  const source = await fs.readFile(playlistPath, "utf8");
  return parsePlaylistEntries(source, playlistPath);
}
