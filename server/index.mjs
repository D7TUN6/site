import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
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
const FFMPEG_TIMEOUT_MS = 8 * 60 * 1000;
const MAX_ACTIVE_JOBS = 12;
const JOB_TTL_MS = 20 * 60 * 1000;
const SLUG_RE = /^[a-z0-9-]{1,128}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATIC_PRECOMPRESSED_EXT_RE = /\.(?:js|css|html|json|svg|txt|xml|map|woff2?|ico)$/i;

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

function resolveTrackSourcePath(release, track) {
  const sourcePath = typeof track.sourceFilePath === "string" ? track.sourceFilePath : null;
  const relative = sourcePath || path.posix.join("tracks", "wav", track.fileName);
  const normalized = path.posix.normalize(relative);
  if (!normalized || normalized === "." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) {
    throw new Error("Invalid track source path");
  }

  const releaseRoot = path.resolve(ROOT, "public", "media", "music", release.sourceDirName);
  const resolvedPath = path.resolve(releaseRoot, normalized.split("/").join(path.sep));
  if (resolvedPath !== releaseRoot && !resolvedPath.startsWith(`${releaseRoot}${path.sep}`)) {
    throw new Error("Invalid track source path");
  }

  return resolvedPath;
}

async function transcodeTrack(params) {
  const { inputPath, format, title, album, trackNumber, totalTracks } = params;
  const outputSampleRate = format === "ogg" ? "48000" : "44100";

  const codecArgs =
    format === "mp3"
      ? ["-c:a", "libmp3lame", "-b:a", "320k", "-id3v2_version", "3", "-f", "mp3"]
      : format === "ogg"
        ? ["-c:a", "libopus", "-b:a", "320k", "-vbr", "on", "-application", "audio", "-f", "ogg"]
        : format === "wav"
          ? ["-c:a", "pcm_s16le", "-f", "wav"]
          : ["-c:a", "flac", "-sample_fmt", "s16", "-ar", "44100", "-f", "flac"];

  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    inputPath,
    "-map_metadata",
    "-1",
    "-vn",
    "-sn",
    "-dn",
    "-ac",
    "2",
    "-ar",
    outputSampleRate,
    "-metadata",
    `title=${title}`,
    "-metadata",
    `artist=${ARTIST_NAME}`,
    "-metadata",
    `album=${album}`,
    "-metadata",
    `track=${trackNumber}/${totalTracks}`,
    ...codecArgs,
    "pipe:1"
  ];

  return await new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    const timeout = setTimeout(() => {
      ffmpeg.kill("SIGKILL");
      reject(new Error("ffmpeg timeout while converting track"));
    }, FFMPEG_TIMEOUT_MS);

    const out = [];
    const err = [];

    ffmpeg.stdout.on("data", (chunk) => out.push(Buffer.from(chunk)));
    ffmpeg.stderr.on("data", (chunk) => err.push(Buffer.from(chunk)));

    ffmpeg.on("error", (error) => {
      clearTimeout(timeout);
      reject(new Error(`ffmpeg failed to start: ${error.message}`));
    });

    ffmpeg.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve(Buffer.concat(out));
        return;
      }

      const stderrText = Buffer.concat(err).toString("utf8").trim();
      reject(new Error(stderrText || `ffmpeg exited with code ${code}`));
    });
  });
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

    const sourcePath = resolveTrackSourcePath(release, track);
    const encoded = await transcodeTrack({
      inputPath: sourcePath,
      format: job.format,
      title: track.title,
      album: release.albumName,
      trackNumber: track.index,
      totalTracks: release.tracks.length
    });

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
  if (!origin) return true;
  try {
    const host = req.get("host");
    if (!host) return false;
    return new URL(origin).host === host;
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

app.post("/api/releases/download", (req, res) => {
  cleanupQueue();
  if (!isSameOriginRequest(req)) {
    return res.status(403).json({ error: "Origin check failed" });
  }

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

  if (countActiveJobs() >= MAX_ACTIVE_JOBS) {
    return res.status(429).json({ error: "Queue is busy, try again later" });
  }

  const now = Date.now();
  const job = {
    id: randomUUID(),
    slug,
    format,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    progressCurrent: 0,
    progressTotal: release.tracks.length + 1,
    message: "Queued",
    error: null,
    zipData: null,
    fileName: null
  };

  queue.jobs.set(job.id, job);
  queue.pending.push(job.id);
  void processQueue();

  res.setHeader("Cache-Control", "no-store");
  return res.status(202).json(toPublicJob(job));
});

app.get("/api/releases/download", (req, res) => {
  cleanupQueue();

  const jobId = typeof req.query.jobId === "string" ? req.query.jobId : null;
  const wantsDownload = req.query.download === "1";

  if (!jobId || !UUID_RE.test(jobId)) {
    return res.status(400).json({ error: "Missing jobId" });
  }

  const job = queue.jobs.get(jobId);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }

  if (!wantsDownload) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(toPublicJob(job));
  }

  if (job.status !== "done" || !job.zipData || !job.fileName) {
    return res.status(409).json({ error: "Job is not ready" });
  }

  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${job.fileName}"`);

  const zipData = job.zipData;
  queue.jobs.delete(jobId);
  cleanupQueue();

  return res.status(200).send(zipData);
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

app.listen(port, host, () => {
  const mode = isDev ? "api-dev" : "production";
  console.log(`d7tun6.site server listening on http://${host}:${port} (${mode})`);
});
