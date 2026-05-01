// Reusable optimizeAlbum logic extracted from scripts/optimize-media.mjs
// Used by the admin upload pipeline at runtime (no build step required).
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const TRACK_EXT = new Set([".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac"]);
const COVER_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, (m) => ` ${m.slice(1, -1)} `)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

function toSafeTrackStem(fileName) {
  return slugify(fileName.replace(/\.[^.]+$/, ""));
}

function normalizeTrackTitle(fileName) {
  return fileName.replace(/\.[^.]+$/, "").replace(/^\s*\d+\s*-\s*/, "").trim();
}

function sortTracksNatural(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function toPublicUrl(root, absPath) {
  const rel = path.relative(path.join(root, "public"), absPath);
  return `/${rel.split(path.sep).join("/")}`;
}

async function statMtime(p) {
  try { return (await fs.stat(p)).mtimeMs; } catch { return 0; }
}

async function ensureFresh(inputPath, outputPath, buildFn) {
  const inputMtime = await statMtime(inputPath);
  const outputMtime = await statMtime(outputPath);
  if (outputMtime >= inputMtime && outputMtime > 0) return false;
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await buildFn();
  return true;
}

function runFfmpeg(args, cwd) {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { cwd, stdio: ["ignore", "ignore", "pipe"] });
    const stderr = [];
    proc.stderr.on("data", (c) => stderr.push(Buffer.from(c)));
    proc.on("error", (e) => reject(new Error(`ffmpeg start failed: ${e.message}`)));
    proc.on("close", (code) => {
      if (code === 0) return resolve();
      const details = Buffer.concat(stderr).toString("utf8").trim();
      reject(new Error(details || `ffmpeg exited with code ${code}`));
    });
  });
}

async function removeIfExists(p) {
  try { await fs.rm(p, { recursive: true, force: true }); } catch { /* ignore */ }
}

async function findExistingCover(coverDir) {
  try {
    const covers = (await fs.readdir(coverDir))
      .filter((f) => COVER_EXT.has(path.extname(f).toLowerCase()) && !/^cover-preview\./i.test(f))
      .sort(sortTracksNatural);
    return covers[0] ? path.join(coverDir, covers[0]) : null;
  } catch { return null; }
}

function buildM3u(items) {
  const lines = ["#EXTM3U"];
  for (const item of items) {
    lines.push(`#EXTINF:-1,${item.title}`);
    lines.push(encodeURI(item.url));
  }
  lines.push("");
  return lines.join("\n");
}

export async function optimizeAlbum(root, albumDirName) {
  const MUSIC_ROOT = path.join(root, "public", "media", "music");
  const albumDir = path.join(MUSIC_ROOT, albumDirName);
  const coverDir = path.join(albumDir, "cover");
  const tracksDir = path.join(albumDir, "tracks");
  const tracksWavDir = path.join(tracksDir, "wav");
  const previewDir = path.join(tracksDir, "preview");
  const streamDir = path.join(tracksDir, "stream");
  const downloadDir = path.join(tracksDir, "download");
  const playlistsDir = path.join(albumDir, "playlists");

  let tracksSourceDir = tracksDir;
  try {
    if ((await fs.stat(tracksWavDir)).isDirectory()) tracksSourceDir = tracksWavDir;
  } catch { /* no wav subdir */ }

  const trackFiles = await fs.readdir(tracksSourceDir)
    .then((e) => e.filter((f) => TRACK_EXT.has(path.extname(f).toLowerCase())).sort(sortTracksNatural))
    .catch(() => null);
  if (!trackFiles) return;

  const numberedTracks = trackFiles.filter((n) => /^\s*\d+\s*-\s*/.test(n));
  const selectedTracks = numberedTracks.length > 0
    ? trackFiles.filter((n) => /^\s*\d+\s*-\s*/.test(n) || /^master\./i.test(n))
    : trackFiles;

  // Cover
  let coverInput = await findExistingCover(coverDir);
  if (!coverInput && selectedTracks[0]) {
    const sourceForCover = path.join(tracksSourceDir, selectedTracks[0]);
    const extractedCover = path.join(coverDir, "cover.jpg");
    await ensureFresh(sourceForCover, extractedCover, async () => {
      await fs.mkdir(coverDir, { recursive: true });
      await runFfmpeg(["-hide_banner", "-loglevel", "error", "-y", "-i", sourceForCover,
        "-an", "-map", "0:v:0", "-frames:v", "1", extractedCover]);
    }).catch(() => { /* no embedded artwork */ });
    coverInput = await findExistingCover(coverDir);
  }

  if (coverInput) {
    const coverPreview = path.join(coverDir, "cover-preview.webp");
    await ensureFresh(coverInput, coverPreview, () =>
      runFfmpeg(["-hide_banner", "-loglevel", "error", "-y", "-i", coverInput,
        "-vf", "scale='min(420,iw)':-2:flags=lanczos", "-q:v", "65",
        "-compression_level", "6", coverPreview])
    );
  }

  const fullPlaylistItems = [];
  const previewPlaylistItems = [];

  await removeIfExists(downloadDir);

  for (const fileName of selectedTracks) {
    const sourceAbs = path.join(tracksSourceDir, fileName);
    const stem = toSafeTrackStem(fileName);
    const previewAbs = path.join(previewDir, `${stem}.ogg`);
    const streamTrackDir = path.join(streamDir, stem);
    const streamPlaylistAbs = path.join(streamTrackDir, "index.m3u8");
    const legacyStreamAbs = path.join(streamDir, `${stem}.ogg`);

    await ensureFresh(sourceAbs, previewAbs, () =>
      runFfmpeg(["-hide_banner", "-loglevel", "error", "-y", "-i", sourceAbs,
        "-map_metadata", "-1", "-vn", "-sn", "-dn", "-ac", "2", "-ar", "48000",
        "-t", "35", "-c:a", "libopus", "-b:a", "96k", "-vbr", "on", previewAbs])
    );

    await ensureFresh(sourceAbs, streamPlaylistAbs, async () => {
      await removeIfExists(streamTrackDir);
      await fs.mkdir(streamTrackDir, { recursive: true });
      await runFfmpeg(["-hide_banner", "-loglevel", "error", "-y", "-i", sourceAbs,
        "-map_metadata", "-1", "-vn", "-sn", "-dn", "-ac", "2", "-ar", "44100",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
        "-f", "hls", "-hls_time", "6", "-hls_playlist_type", "vod",
        "-hls_segment_type", "fmp4", "-hls_fmp4_init_filename", "init.mp4",
        "-hls_flags", "independent_segments",
        "-hls_segment_filename", "segment-%03d.m4s", "index.m3u8"],
        streamTrackDir);
    });

    await removeIfExists(legacyStreamAbs);

    const publicTitle = normalizeTrackTitle(fileName);
    fullPlaylistItems.push({ title: publicTitle, url: toPublicUrl(root, streamPlaylistAbs) });
    previewPlaylistItems.push({ title: publicTitle, url: toPublicUrl(root, previewAbs) });
  }

  await fs.mkdir(playlistsDir, { recursive: true });
  await fs.writeFile(path.join(playlistsDir, "full.m3u"), buildM3u(fullPlaylistItems));
  await fs.writeFile(path.join(playlistsDir, "full.m3u8"), buildM3u(fullPlaylistItems));
  await fs.writeFile(path.join(playlistsDir, "preview.m3u"), buildM3u(previewPlaylistItems));
  await fs.writeFile(path.join(playlistsDir, "preview.m3u8"), buildM3u(previewPlaylistItems));
}
