import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import compression from "compression";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import JSZip from "jszip";
import mime from "mime-types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT, "dist");
const RELEASE_DATA_PATH = path.join(__dirname, "generated", "release-download-data.json");

const ARTIST_NAME = "D7TUN6";
const MAX_TRACKS_PER_ARCHIVE = 64;
const MAX_ACTIVE_JOBS = 12;
const JOB_TTL_MS = 20 * 60 * 1000;
const SLUG_RE = /^[a-z0-9-]{1,128}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATIC_PRECOMPRESSED_EXT_RE = /\.(?:js|css|html|json|svg|txt|xml|map|woff2?|ico)$/i;
const TRACK_INDEX_RE = /^\d{1,3}$/;

const isDev = process.argv.includes("--dev");
const defaultPort = isDev ? 3002 : 3001;
const port = Number(process.env.PORT || defaultPort);
const host = process.env.HOSTNAME || "127.0.0.1";

let releaseDownloadData = [];

const queue = {
  jobs: new Map(),
  pending: [],
  workerActive: false
};

function sanitizeFileName(value) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
}

function formatExt(format) {
  if (format === "mp3") return "mp3";
  if (format === "ogg") return "ogg";
  if (format === "wav") return "wav";
  return "flac";
}

function isOutputFormat(value) {
  return value === "mp3" || value === "ogg" || value === "flac" || value === "wav";
}

function toPublicJob(job) {
  const progress =
    job.progressTotal > 0
      ? Math.max(0, Math.min(100, Math.round((job.progressCurrent / job.progressTotal) * 100)))
      : 0;

  return {
    jobId: job.id,
    status: job.status,
    progress,
    message: job.message,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  };
}

function countActiveJobs() {
  let count = 0;
  for (const job of queue.jobs.values()) {
    if (job.status === "queued" || job.status === "running") {
      count += 1;
    }
  }
  return count;
}

function cleanupQueue() {
  const now = Date.now();

  for (const [jobId, job] of queue.jobs.entries()) {
    if (job.status === "queued" || job.status === "running") continue;
    if (now - job.updatedAt > JOB_TTL_MS) {
      queue.jobs.delete(jobId);
    }
  }

  queue.pending = queue.pending.filter((jobId) => queue.jobs.has(jobId));
}

function resolveTrackAssetPath(release, relative) {
  const normalized = path.posix.normalize(relative);
  if (!normalized || normalized === "." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) {
    throw new Error("Invalid track path");
  }

  const releaseRoot = path.resolve(ROOT, "public", "media", "music", release.sourceDirName);
  const resolvedPath = path.resolve(releaseRoot, normalized.split("/").join(path.sep));
  if (resolvedPath !== releaseRoot && !resolvedPath.startsWith(`${releaseRoot}${path.sep}`)) {
    throw new Error("Invalid track path");
  }

  return resolvedPath;
}

function resolveTrackDownloadPath(release, track, format) {
  return resolveTrackAssetPath(release, path.posix.join("tracks", "download", format, `${track.safeStem}.${format}`));
}

async function createReleaseArchive(release, format) {
  const zip = new JSZip();
  const extension = formatExt(format);

  for (const track of release.tracks) {
    if (!Array.isArray(track.availableDownloadFormats) || !track.availableDownloadFormats.includes(format)) {
      throw new Error(`Track "${track.title}" is not available in ${format}`);
    }

    const encoded = await readFile(resolveTrackDownloadPath(release, track, format));
    const zipName = `${String(track.index).padStart(2, "0")} - ${sanitizeFileName(track.title)}.${extension}`;
    zip.file(`tracks/${zipName}`, encoded);
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

  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 }
  });

  return {
    fileName: `${sanitizeFileName(release.albumName)}-${format}.zip`,
    zipBuffer
  };
}

async function buildReleaseArchive(job) {
  const release = releaseDownloadData.find((entry) => entry.slug === job.slug);
  if (!release) {
    throw new Error("Release not found");
  }

  if (release.tracks.length === 0) {
    throw new Error("No tracks found in release");
  }

  if (release.tracks.length > MAX_TRACKS_PER_ARCHIVE) {
    throw new Error("Too many tracks in release");
  }

  const zip = new JSZip();
  const extension = formatExt(job.format);
  job.progressTotal = release.tracks.length + 1;

  for (const track of release.tracks) {
    job.message = `Converting track ${track.index}/${release.tracks.length}`;
    job.updatedAt = Date.now();

    if (!Array.isArray(track.availableDownloadFormats) || !track.availableDownloadFormats.includes(job.format)) {
      throw new Error(`Track "${track.title}" is not available in ${job.format}`);
    }

    const encoded = await readFile(resolveTrackDownloadPath(release, track, job.format));

    const zipName = `${String(track.index).padStart(2, "0")} - ${sanitizeFileName(track.title)}.${extension}`;
    zip.file(`tracks/${zipName}`, encoded);

    job.progressCurrent += 1;
    job.updatedAt = Date.now();
  }

  job.message = "Packing ZIP archive";
  job.updatedAt = Date.now();

  const metadataText = [
    `artist: ${ARTIST_NAME}`,
    `album: ${release.albumName}`,
    `release_date: ${release.releaseDate}`,
    `format: ${job.format}`,
    `sample_rate: ${job.format === "ogg" ? "48000" : "44100"}`,
    job.format === "flac"
      ? "bit_depth: 16"
      : job.format === "ogg"
        ? "codec: opus (vbr), target_bitrate: 320k"
        : job.format === "wav"
          ? "codec: pcm_s16le"
          : "bitrate: 320k",
    "",
    "tracks:",
    ...release.tracks.map((track) => `${track.index}. ${track.title}`)
  ].join("\n");

  zip.file("release-info.txt", metadataText);

  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 }
  });

  job.progressCurrent = job.progressTotal;
  job.message = "Ready for download";
  job.fileName = `${sanitizeFileName(release.albumName)}-${job.format}.zip`;
  job.zipData = zipBuffer;
  job.updatedAt = Date.now();
}

async function processQueue() {
  if (queue.workerActive) return;

  queue.workerActive = true;

  try {
    while (queue.pending.length > 0) {
      const jobId = queue.pending.shift();
      if (!jobId) break;

      const job = queue.jobs.get(jobId);
      if (!job || job.status !== "queued") continue;

      job.status = "running";
      job.message = "Preparing conversion";
      job.updatedAt = Date.now();

      try {
        await buildReleaseArchive(job);
        job.status = "done";
        job.error = null;
      } catch (error) {
        job.status = "failed";
        job.error = error instanceof Error ? error.message : "Unexpected conversion error";
        job.message = "Conversion failed";
      } finally {
        job.updatedAt = Date.now();
      }
    }
  } finally {
    queue.workerActive = false;
    cleanupQueue();

    if (queue.pending.length > 0) {
      void processQueue();
    }
  }
}

function findRelease(slug) {
  return releaseDownloadData.find((entry) => entry.slug === slug);
}

function isSameOriginRequest(req) {
  const origin = req.get("origin");
  const referer = req.get("referer");
  if (!origin && !referer) return true;

  const localHostnames = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

  try {
    const requestHost = req.get("host");
    if (!requestHost) return false;

    const requestUrl = new URL(`http://${requestHost}`);
    const candidateUrls = [origin, referer].filter(Boolean).map((value) => new URL(value));

    return candidateUrls.some((candidateUrl) => {
      if (candidateUrl.host === requestUrl.host) {
        return true;
      }

      const sameLocalMachine =
        localHostnames.has(candidateUrl.hostname) && localHostnames.has(requestUrl.hostname);

      if (!sameLocalMachine) {
        return false;
      }

      if (isDev) {
        return true;
      }

      if (!candidateUrl.port || !requestUrl.port) {
        return true;
      }

      return candidateUrl.port === requestUrl.port;
    });
  } catch {
    return false;
  }
}

function precompressedStaticMiddleware(req, res, next) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return next();
  }

  let requestPath = req.path;
  try {
    requestPath = decodeURIComponent(req.path);
  } catch {
    return next();
  }

  if (!STATIC_PRECOMPRESSED_EXT_RE.test(requestPath)) {
    return next();
  }

  const relativePath = requestPath.startsWith("/") ? requestPath.slice(1) : requestPath;
  const absolutePath = path.resolve(DIST_DIR, relativePath);
  if (!absolutePath.startsWith(DIST_DIR)) {
    return next();
  }

  const acceptedEncodings = String(req.headers["accept-encoding"] || "");
  let encodedSuffix = "";

  if (acceptedEncodings.includes("br") && existsSync(`${absolutePath}.br`)) {
    encodedSuffix = ".br";
    res.setHeader("Content-Encoding", "br");
  } else if (acceptedEncodings.includes("gzip") && existsSync(`${absolutePath}.gz`)) {
    encodedSuffix = ".gz";
    res.setHeader("Content-Encoding", "gzip");
  }

  if (!encodedSuffix) {
    return next();
  }

  const contentType = mime.lookup(requestPath);
  if (contentType) {
    res.setHeader("Content-Type", contentType);
  }

  res.setHeader("Vary", "Accept-Encoding");
  req.url = `${req.url}${encodedSuffix}`;
  return next();
}

async function bootstrapReleaseData() {
  const raw = await readFile(RELEASE_DATA_PATH, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("Invalid generated release data format");
  }
  releaseDownloadData = parsed;
}

await bootstrapReleaseData();

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "img-src": ["'self'", "data:", "blob:"],
        "media-src": ["'self'", "blob:"],
        "connect-src": ["'self'"],
        "font-src": ["'self'", "data:"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "script-src": ["'self'"],
        "object-src": ["'none'"],
        "base-uri": ["'self'"],
        "frame-ancestors": ["'none'"]
      }
    }
  })
);
app.use(
  compression({
    filter: (req, res) => {
      if (req.path.endsWith(".zip")) return false;
      return compression.filter(req, res);
    }
  })
);
app.use(express.json({ limit: "64kb" }));
app.use(
  "/api",
  rateLimit({
    windowMs: 60 * 1000,
    max: 240,
    standardHeaders: true,
    legacyHeaders: false
  })
);

app.post("/api/releases/download", async (req, res) => {
  const slug = typeof req.body?.slug === "string" ? req.body.slug : null;
  const format = typeof req.body?.format === "string" ? req.body.format : null;

  if (!slug || !SLUG_RE.test(slug) || !isOutputFormat(format)) {
    return res.status(400).json({ error: "Invalid slug or format" });
  }

  const release = findRelease(slug);
  if (!release) {
    return res.status(404).json({ error: "Release not found" });
  }

  if (release.tracks.length === 0) {
    return res.status(400).json({ error: "No tracks found in release" });
  }

  if (release.tracks.length > MAX_TRACKS_PER_ARCHIVE) {
    return res.status(400).json({ error: "Too many tracks in release" });
  }

  if (!Array.isArray(release.availableDownloadFormats) || !release.availableDownloadFormats.includes(format)) {
    return res.status(400).json({ error: "Format is not available for the whole release" });
  }

  try {
    const { fileName, zipBuffer } = await createReleaseArchive(release, format);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.status(200).send(zipBuffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to build release archive";
    return res.status(500).json({ error: message });
  }
});

app.get("/api/releases/track", async (req, res) => {
  const slug = typeof req.query.slug === "string" ? req.query.slug : null;
  const trackIndexRaw = typeof req.query.track === "string" ? req.query.track : null;
  const format = typeof req.query.format === "string" ? req.query.format : null;

  if (!slug || !SLUG_RE.test(slug) || !trackIndexRaw || !TRACK_INDEX_RE.test(trackIndexRaw) || !isOutputFormat(format)) {
    return res.status(400).json({ error: "Invalid slug, track, or format" });
  }

  const release = findRelease(slug);
  if (!release) {
    return res.status(404).json({ error: "Release not found" });
  }

  const trackIndex = Number(trackIndexRaw);
  const track = release.tracks.find((entry) => entry.index === trackIndex);
  if (!track) {
    return res.status(404).json({ error: "Track not found" });
  }

  if (!Array.isArray(track.availableDownloadFormats) || !track.availableDownloadFormats.includes(format)) {
    return res.status(400).json({ error: "Format is not available for this track" });
  }

  try {
    const filePath = resolveTrackDownloadPath(release, track, format);
    const fileName = `${String(track.index).padStart(2, "0")} - ${sanitizeFileName(track.title)}.${formatExt(format)}`;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.download(filePath, fileName);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to download track";
    return res.status(500).json({ error: message });
  }
});

app.get("/api/releases/download", async (req, res) => {
  const slug = typeof req.query.slug === "string" ? req.query.slug : null;
  const format = typeof req.query.format === "string" ? req.query.format : null;

  if (!slug || !SLUG_RE.test(slug) || !isOutputFormat(format)) {
    return res.status(400).json({ error: "Invalid slug or format" });
  }

  const release = findRelease(slug);
  if (!release) {
    return res.status(404).json({ error: "Release not found" });
  }

  if (release.tracks.length === 0) {
    return res.status(400).json({ error: "No tracks found in release" });
  }

  if (release.tracks.length > MAX_TRACKS_PER_ARCHIVE) {
    return res.status(400).json({ error: "Too many tracks in release" });
  }

  if (!Array.isArray(release.availableDownloadFormats) || !release.availableDownloadFormats.includes(format)) {
    return res.status(400).json({ error: "Format is not available for the whole release" });
  }

  try {
    const { fileName, zipBuffer } = await createReleaseArchive(release, format);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.status(200).send(zipBuffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to build release archive";
    return res.status(500).json({ error: message });
  }
});

app.get("/api/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

if (!isDev) {
  app.use(precompressedStaticMiddleware);
  app.use(
    express.static(DIST_DIR, {
      index: false,
      setHeaders: (res, filePath) => {
        const relative = path.relative(DIST_DIR, filePath).split(path.sep).join("/");
        if (relative.endsWith(".m3u8")) {
          res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
        } else if (relative.endsWith(".m4s")) {
          res.setHeader("Content-Type", "video/iso.segment");
        } else if (relative.endsWith(".mp4") && relative.includes("/stream/")) {
          res.setHeader("Content-Type", "audio/mp4");
        }

        if (relative.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-cache");
          return;
        }

        if (relative.startsWith("assets/") && /-[A-Za-z0-9_-]{8,}\./.test(path.basename(relative))) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          return;
        }

        res.setHeader("Cache-Control", "public, max-age=86400");
      }
    })
  );

  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(DIST_DIR, "index.html"));
  });
}

const server = app.listen(port, host, () => {
  const mode = isDev ? "api-dev" : "production";
  console.log(`d7tun6.site server listening on http://${host}:${port} (${mode})`);
});

server.ref();

// Some Windows/Node setups let the dev API process exit immediately after listen().
// Keep the event loop pinned explicitly in dev so concurrently does not tear down Vite.
const devKeepAlive = isDev ? setInterval(() => {}, 1 << 30) : null;

function shutdown() {
  if (devKeepAlive) {
    clearInterval(devKeepAlive);
  }
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
