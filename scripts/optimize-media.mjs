import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MUSIC_ROOT = path.join(ROOT, "public", "media", "music");
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
  const noExt = fileName.replace(/\.[^.]+$/, "");
  return noExt.replace(/^\s*\d+\s*-\s*/, "").trim();
}

function sortTracksNatural(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function toPublicUrl(absPath) {
  const rel = path.relative(path.join(ROOT, "public"), absPath);
  const normalized = rel.split(path.sep).join("/");
  return `/${normalized}`;
}

async function statMtime(pathToCheck) {
  try {
    const stat = await fs.stat(pathToCheck);
    return stat.mtimeMs;
  } catch {
    return 0;
  }
}

async function ensureFresh(inputPath, outputPath, buildFn) {
  const inputMtime = await statMtime(inputPath);
  const outputMtime = await statMtime(outputPath);

  if (outputMtime >= inputMtime && outputMtime > 0) {
    return false;
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await buildFn();
  return true;
}

async function runFfmpeg(args) {
  await new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", args, {
      stdio: ["ignore", "ignore", "pipe"]
    });

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

function buildM3u(urls) {
  const lines = ["#EXTM3U"];
  for (const item of urls) {
    lines.push(`#EXTINF:-1,${item.title}`);
    lines.push(encodeURI(item.url));
  }
  lines.push("");
  return lines.join("\n");
}

async function optimizeAlbum(albumDirName) {
  const albumDir = path.join(MUSIC_ROOT, albumDirName);
  const coverDir = path.join(albumDir, "cover");
  const tracksDir = path.join(albumDir, "tracks");
  const tracksWavDir = path.join(tracksDir, "wav");
  const previewDir = path.join(tracksDir, "preview");
  const streamDir = path.join(tracksDir, "stream");
  const playlistsDir = path.join(albumDir, "playlists");

  let tracksSourceDir = tracksDir;
  try {
    const wavStat = await fs.stat(tracksWavDir);
    if (wavStat.isDirectory()) {
      tracksSourceDir = tracksWavDir;
    }
  } catch {
    tracksSourceDir = tracksDir;
  }

  try {
    const covers = (await fs.readdir(coverDir))
      .filter((f) => COVER_EXT.has(path.extname(f).toLowerCase()) && !/^cover-preview\./i.test(f))
      .sort(sortTracksNatural);

    if (covers[0]) {
      const coverInput = path.join(coverDir, covers[0]);
      const coverPreview = path.join(coverDir, "cover-preview.webp");

      await ensureFresh(coverInput, coverPreview, async () => {
        await runFfmpeg([
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-i",
          coverInput,
          "-vf",
          "scale='min(420,iw)':-2:flags=lanczos",
          "-q:v",
          "65",
          "-compression_level",
          "6",
          coverPreview
        ]);
      });
    }
  } catch {
    // No cover found, skip.
  }

  let trackFiles = [];
  try {
    trackFiles = (await fs.readdir(tracksSourceDir))
      .filter((f) => TRACK_EXT.has(path.extname(f).toLowerCase()))
      .sort(sortTracksNatural);
  } catch {
    return;
  }

  const numberedTracks = trackFiles.filter((name) => /^\s*\d+\s*-\s*/.test(name));
  const selectedTracks =
    numberedTracks.length > 0
      ? trackFiles.filter((name) => /^\s*\d+\s*-\s*/.test(name) || /^master\./i.test(name))
      : trackFiles;

  const fullPlaylistItems = [];
  const previewPlaylistItems = [];

  for (const fileName of selectedTracks) {
    const sourceAbs = path.join(tracksSourceDir, fileName);
    const stem = toSafeTrackStem(fileName);

    const previewAbs = path.join(previewDir, `${stem}.ogg`);
    const streamAbs = path.join(streamDir, `${stem}.ogg`);

    await ensureFresh(sourceAbs, previewAbs, async () => {
      await runFfmpeg([
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        sourceAbs,
        "-map_metadata",
        "-1",
        "-vn",
        "-sn",
        "-dn",
        "-ac",
        "2",
        "-ar",
        "48000",
        "-t",
        "35",
        "-c:a",
        "libopus",
        "-b:a",
        "96k",
        "-vbr",
        "on",
        previewAbs
      ]);
    });

    await ensureFresh(sourceAbs, streamAbs, async () => {
      await runFfmpeg([
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        sourceAbs,
        "-map_metadata",
        "-1",
        "-vn",
        "-sn",
        "-dn",
        "-ac",
        "2",
        "-ar",
        "48000",
        "-c:a",
        "libopus",
        "-b:a",
        "160k",
        "-vbr",
        "on",
        streamAbs
      ]);
    });

    const publicTitle = normalizeTrackTitle(fileName);
    fullPlaylistItems.push({
      title: publicTitle,
      url: toPublicUrl(streamAbs)
    });

    previewPlaylistItems.push({
      title: publicTitle,
      url: toPublicUrl(previewAbs)
    });
  }

  await fs.mkdir(playlistsDir, { recursive: true });
  await fs.writeFile(path.join(playlistsDir, "full.m3u"), buildM3u(fullPlaylistItems));
  await fs.writeFile(path.join(playlistsDir, "full.m3u8"), buildM3u(fullPlaylistItems), "utf8");
  await fs.writeFile(path.join(playlistsDir, "preview.m3u"), buildM3u(previewPlaylistItems));
  await fs.writeFile(path.join(playlistsDir, "preview.m3u8"), buildM3u(previewPlaylistItems), "utf8");
}

async function main() {
  const dirents = await fs.readdir(MUSIC_ROOT, { withFileTypes: true });
  const albums = dirents.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

  for (const albumDirName of albums) {
    console.log(`Optimizing media: ${albumDirName}`);
    await optimizeAlbum(albumDirName);
  }

  console.log(`Media optimization complete (${albums.length} albums)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
