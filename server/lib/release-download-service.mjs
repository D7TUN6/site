import { createReadStream, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

const ARTIST_NAME = "D7TUN6";
const MAX_TRACKS_PER_ARCHIVE = 64;
const SLUG_RE = /^[a-z0-9-]{1,128}$/;
const TRACK_INDEX_RE = /^\d{1,3}$/;
const OUTPUT_FORMATS = new Set(["flac", "mp3", "ogg", "wav"]);
const MAX_ACTIVE_ARCHIVES = 2;

export class PublicRequestError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "PublicRequestError";
    this.status = status;
  }
}

export class ReleaseDownloadService {
  #root;
  #releaseDataPath;
  #releaseBySlug = new Map();
  #activeArchives = 0;

  constructor({ root, releaseDataPath }) {
    this.#root = root;
    this.#releaseDataPath = releaseDataPath;
  }

  async bootstrap() {
    const raw = await readFile(this.#releaseDataPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error("Invalid generated release data format");
    }

    this.#releaseBySlug = new Map(parsed.map((entry) => [entry.slug, entry]));
  }

  sanitizeFileName(value) {
    return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
  }

  formatExt(format) {
    if (format === "mp3") return "mp3";
    if (format === "ogg") return "ogg";
    if (format === "wav") return "wav";
    return "flac";
  }

  isOutputFormat(value) {
    return OUTPUT_FORMATS.has(value);
  }

  validateReleaseRequest(slug, format) {
    if (!slug || !SLUG_RE.test(slug) || !this.isOutputFormat(format)) {
      throw new PublicRequestError(400, "Invalid slug or format");
    }
  }

  validateTrackRequest(slug, trackIndexRaw, format) {
    if (!slug || !SLUG_RE.test(slug) || !trackIndexRaw || !TRACK_INDEX_RE.test(trackIndexRaw) || !this.isOutputFormat(format)) {
      throw new PublicRequestError(400, "Invalid slug, track, or format");
    }
  }

  findRelease(slug) {
    return this.#releaseBySlug.get(slug) ?? null;
  }

  getReleaseOrThrow(slug) {
    const release = this.findRelease(slug);
    if (!release) {
      throw new PublicRequestError(404, "Release not found");
    }
    return release;
  }

  ensureReleaseIsDownloadable(release, format) {
    if (!Array.isArray(release.tracks) || release.tracks.length === 0) {
      throw new PublicRequestError(400, "No tracks found in release");
    }

    if (release.tracks.length > MAX_TRACKS_PER_ARCHIVE) {
      throw new PublicRequestError(400, "Too many tracks in release");
    }

    if (!Array.isArray(release.availableDownloadFormats) || !release.availableDownloadFormats.includes(format)) {
      throw new PublicRequestError(400, "Format is not available for the whole release");
    }
  }

  getTrackOrThrow(release, trackIndexRaw, format) {
    const trackIndex = Number(trackIndexRaw);
    const track = release.tracks.find((entry) => entry.index === trackIndex);
    if (!track) {
      throw new PublicRequestError(404, "Track not found");
    }

    if (!Array.isArray(track.availableDownloadFormats) || !track.availableDownloadFormats.includes(format)) {
      throw new PublicRequestError(400, "Format is not available for this track");
    }

    return track;
  }

  resolveTrackAssetPath(release, relative) {
    const normalized = path.posix.normalize(relative);
    if (!normalized || normalized === "." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) {
      throw new PublicRequestError(400, "Invalid track path");
    }

    const releaseRoot = path.resolve(this.#root, "public", "media", "music", release.sourceDirName);
    const resolvedPath = path.resolve(releaseRoot, normalized.split("/").join(path.sep));
    if (resolvedPath !== releaseRoot && !resolvedPath.startsWith(`${releaseRoot}${path.sep}`)) {
      throw new PublicRequestError(400, "Invalid track path");
    }

    return resolvedPath;
  }

  resolveTrackDownloadPath(release, track, format) {
    return this.resolveTrackAssetPath(release, path.posix.join("tracks", "download", format, `${track.safeStem}.${format}`));
  }

  getTrackDownload(release, track, format) {
    const filePath = this.resolveTrackDownloadPath(release, track, format);
    if (!existsSync(filePath)) {
      throw new PublicRequestError(404, "Track file not found");
    }

    return {
      filePath,
      fileName: `${String(track.index).padStart(2, "0")} - ${this.sanitizeFileName(track.title)}.${this.formatExt(format)}`
    };
  }

  async streamReleaseArchive(res, release, format) {
    this.ensureReleaseIsDownloadable(release, format);

    if (this.#activeArchives >= MAX_ACTIVE_ARCHIVES) {
      throw new PublicRequestError(429, "Archive generation is busy, try again shortly");
    }

    this.#activeArchives += 1;

    try {
      const zip = new JSZip();
      const extension = this.formatExt(format);

      for (const track of release.tracks) {
        if (!Array.isArray(track.availableDownloadFormats) || !track.availableDownloadFormats.includes(format)) {
          throw new PublicRequestError(400, `Track "${track.title}" is not available in ${format}`);
        }

        const filePath = this.resolveTrackDownloadPath(release, track, format);
        if (!existsSync(filePath)) {
          throw new PublicRequestError(404, `Missing source for track ${track.index}`);
        }

        const zipName = `${String(track.index).padStart(2, "0")} - ${this.sanitizeFileName(track.title)}.${extension}`;
        zip.file(`tracks/${zipName}`, createReadStream(filePath), { binary: true });
      }

      const metadataText = [
        `artist: ${ARTIST_NAME}`,
        `album: ${release.albumName}`,
        `release_date: ${release.releaseDate}`,
        `format: ${format}`,
        `sample_rate: ${format === "ogg" ? "48000" : "44100"}`,
        format === "flac"
          ? "bit_depth: 16"
          : format === "ogg"
            ? "codec: opus (vbr), target_bitrate: 320k"
            : format === "wav"
              ? "codec: pcm_s16le"
              : "bitrate: 320k",
        "",
        "tracks:",
        ...release.tracks.map((track) => `${track.index}. ${track.title}`)
      ].join("\n");

      zip.file("release-info.txt", metadataText);

      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${this.sanitizeFileName(release.albumName)}-${format}.zip"`
      );

      await new Promise((resolve, reject) => {
        const stream = zip.generateNodeStream({
          streamFiles: true,
          compression: "DEFLATE",
          compressionOptions: { level: 6 }
        });

        stream.on("error", reject);
        res.on("close", resolve);
        res.on("finish", resolve);
        stream.pipe(res);
      });
    } finally {
      this.#activeArchives = Math.max(0, this.#activeArchives - 1);
    }
  }
}
