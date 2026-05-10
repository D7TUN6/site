import { spawn } from "node:child_process";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import {
  buildReleaseArchiveObjectKey,
  buildReleaseArchiveUrl,
  buildReleaseTrackDownloadObjectKey,
  buildReleaseTrackDownloadUrl
} from "./release-storage.mjs";
import { ensureMinioReady, minioObjectExists, uploadFileToMinio } from "./minio-storage.mjs";

const ARTIST_NAME = "D7TUN6";
const MAX_TRACKS_PER_ARCHIVE = 64;
const SLUG_RE = /^[a-z0-9-]{1,128}$/;
const TRACK_INDEX_RE = /^\d{1,3}$/;
const OUTPUT_FORMATS = new Set(["flac", "mp3", "ogg", "wav"]);

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
  #releaseList = [];
  #archiveBuilds = new Map();
  #trackBuilds = new Map();

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

    this.#releaseList = parsed;
    this.#releaseBySlug = new Map(parsed.map((entry) => [entry.slug, entry]));
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

  resolveLocalTrackSourcePath(release, track) {
    return path.resolve(
      this.#root,
      "public",
      "media",
      "music",
      release.sourceDirName,
      track.sourceFilePath
    );
  }

  async #createTempTrackDownloadDir(prefix) {
    const tempRoot = path.join(this.#root, "tmp", "release-downloads");
    await mkdir(tempRoot, { recursive: true });
    return mkdtemp(path.join(tempRoot, prefix));
  }

  async #resolveLocalTrackDownloadPath(release, track, format) {
    const sourcePath = this.resolveLocalTrackSourcePath(release, track);
    if (!existsSync(sourcePath)) {
      throw new PublicRequestError(404, "Track source file not found");
    }

    if (this.#sameFormatSource(track, format)) {
      return { localPath: sourcePath, cleanupDir: null };
    }

    const tempDir = await this.#createTempTrackDownloadDir("track-");
    const tempFile = path.join(tempDir, `${track.safeStem}.${format}`);

    try {
      await this.#transcodeTrack(sourcePath, tempFile, format);
      return { localPath: tempFile, cleanupDir: tempDir };
    } catch (error) {
      await rm(tempDir, { recursive: true, force: true });
      throw error;
    }
  }

  async ensureTrackDownloadCached(release, track, format) {
    const objectKey = buildReleaseTrackDownloadObjectKey(release, track, format);
    if (await minioObjectExists(objectKey)) {
      return buildReleaseTrackDownloadUrl(release, track, format);
    }

    const cacheKey = `${release.slug}:${track.index}:${format}`;
    if (!this.#trackBuilds.has(cacheKey)) {
      const buildPromise = this.#buildAndUploadTrack(release, track, format, objectKey).finally(() => {
        this.#trackBuilds.delete(cacheKey);
      });
      this.#trackBuilds.set(cacheKey, buildPromise);
    }

    await this.#trackBuilds.get(cacheKey);
    return buildReleaseTrackDownloadUrl(release, track, format);
  }

  async ensureReleaseArchiveCached(release, format) {
    const objectKey = buildReleaseArchiveObjectKey(release, format);
    const existing = await minioObjectExists(objectKey);
    if (existing) {
      return buildReleaseArchiveUrl(release, format);
    }

    const cacheKey = `${release.slug}:${format}`;
    if (!this.#archiveBuilds.has(cacheKey)) {
      const buildPromise = this.#buildAndUploadArchive(release, format, objectKey).finally(() => {
        this.#archiveBuilds.delete(cacheKey);
      });
      this.#archiveBuilds.set(cacheKey, buildPromise);
    }

    await this.#archiveBuilds.get(cacheKey);
    return buildReleaseArchiveUrl(release, format);
  }

  async #buildAndUploadArchive(release, format, objectKey) {
    await ensureMinioReady();

    const tempDir = await this.#createTempTrackDownloadDir("zip-");
    const tempFile = path.join(tempDir, `${release.slug}-${format}.zip`);

    try {
      await this.#writeArchiveFile(tempFile, release, format);
      await uploadFileToMinio(tempFile, objectKey);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  async #buildAndUploadTrack(release, track, format, objectKey) {
    await ensureMinioReady();

    const { localPath, cleanupDir } = await this.#resolveLocalTrackDownloadPath(release, track, format);

    try {
      await uploadFileToMinio(localPath, objectKey);
    } finally {
      if (cleanupDir) {
        await rm(cleanupDir, { recursive: true, force: true });
      }
    }
  }

  #sameFormatSource(track, format) {
    return path.extname(track.sourceFilePath).replace(".", "").toLowerCase() === format;
  }

  async #transcodeTrack(sourcePath, outputPath, format) {
    const codecArgs =
      format === "flac"
        ? ["-c:a", "flac", "-sample_fmt", "s16", "-ar", "44100", outputPath]
        : format === "mp3"
          ? ["-c:a", "libmp3lame", "-b:a", "320k", "-ar", "44100", outputPath]
          : format === "wav"
            ? ["-c:a", "pcm_s16le", "-ar", "44100", outputPath]
            : ["-c:a", "libopus", "-b:a", "192k", "-vbr", "on", "-ar", "48000", outputPath];

    await new Promise((resolve, reject) => {
      const ffmpeg = spawn("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        sourcePath,
        "-map_metadata",
        "-1",
        "-vn",
        "-sn",
        "-dn",
        "-ac",
        "2",
        ...codecArgs
      ]);

      const stderr = [];

      ffmpeg.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
      ffmpeg.on("error", (error) => {
        reject(new Error(`ffmpeg start failed: ${error.message}`));
      });
      ffmpeg.on("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        const details = Buffer.concat(stderr).toString("utf8").trim();
        reject(new Error(details || `ffmpeg exited with code ${code}`));
      });
    });
  }

  async #writeArchiveFile(tempFile, release, format) {
    const zip = new JSZip();
    const extension = this.formatExt(format);
    const cleanupDirs = [];

    for (const track of release.tracks) {
      if (!Array.isArray(track.availableDownloadFormats) || !track.availableDownloadFormats.includes(format)) {
        throw new PublicRequestError(400, `Track "${track.title}" is not available in ${format}`);
      }

      const { localPath, cleanupDir } = await this.#resolveLocalTrackDownloadPath(release, track, format);
      if (cleanupDir) cleanupDirs.push(cleanupDir);

      const zipName = `${String(track.index).padStart(2, "0")} - ${this.sanitizeFileName(track.title)}.${extension}`;
      zip.file(`tracks/${zipName}`, createReadStream(localPath), { binary: true });
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

    try {
      await new Promise((resolve, reject) => {
        const stream = zip.generateNodeStream({
          streamFiles: true,
          compression: "DEFLATE",
          compressionOptions: { level: 6 }
        });

        const fileStream = createWriteStream(tempFile);
        stream.on("error", reject);
        fileStream.on("error", reject);
        fileStream.on("finish", resolve);
        stream.pipe(fileStream);
      });
    } finally {
      for (const cleanupDir of cleanupDirs) {
        await rm(cleanupDir, { recursive: true, force: true });
      }
    }
  }

  sanitizeFileName(value) {
    return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
  }

  async prewarmAllArchives() {
    for (const release of this.#releaseList) {
      if (!Array.isArray(release.availableDownloadFormats)) continue;

      for (const format of release.availableDownloadFormats) {
        await this.ensureReleaseArchiveCached(release, format);
      }
    }
  }
}
