import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MUSIC_ROOT = path.join(ROOT, "public", "media", "music");
const GENERATED_RELEASE_DATA = path.join(ROOT, "server", "generated", "release-download-data.json");
const GENERATED_RELEASE_MANIFEST = path.join(ROOT, "src", "generated", "release-manifest.json");
const RELEASE_MDX_ROOT = path.join(ROOT, "content", "mdx");

const TRACK_EXT = new Set([".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac"]);
const COVER_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);
const URL_PROTOCOL_RE = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;

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

function toPublicUrl(absPath) {
  const rel = path.relative(path.join(ROOT, "public"), absPath);
  const normalized = rel.split(path.sep).join("/");
  return `/${normalized}`;
}

function normalizeTrackTitle(fileName) {
  const noExt = fileName.replace(/\.[^.]+$/, "");
  return noExt.replace(/^\s*\d+\s*-\s*/, "").trim();
}

function sortTracksNatural(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function sortAlbums(a, b) {
  const aDeluxe = /\(deluxe analog edition\)/i.test(a.albumName);
  const bDeluxe = /\(deluxe analog edition\)/i.test(b.albumName);
  const aBase = a.albumName.replace(/\s*\(deluxe analog edition\)\s*/i, "").trim();
  const bBase = b.albumName.replace(/\s*\(deluxe analog edition\)\s*/i, "").trim();
  const byBase = aBase.localeCompare(bBase, undefined, { sensitivity: "base" });
  if (byBase !== 0) return byBase;
  return Number(aDeluxe) - Number(bDeluxe);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatDate(date) {
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function normalizeYear(yearRaw) {
  const year = Number(yearRaw);
  if (!Number.isFinite(year)) return null;
  if (yearRaw.length === 2) return 2000 + year;
  return year;
}

function parseReleaseDateFromNotes(notes) {
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

function decodeMaybe(value) {
  try {
    return decodeURI(value);
  } catch {
    return value;
  }
}

function fallbackTrackTitleFromPlaylistUrl(rawUrl) {
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

function normalizePlaylistUrl(rawUrl, playlistPath) {
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

function parsePlaylistEntries(source, playlistPath) {
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

async function exists(pathToCheck) {
  try {
    await fs.access(pathToCheck);
    return true;
  } catch {
    return false;
  }
}

async function readPlaylistEntries(playlistPath) {
  if (!(await exists(playlistPath))) {
    return [];
  }

  const source = await fs.readFile(playlistPath, "utf8");
  return parsePlaylistEntries(source, playlistPath);
}

async function readAlbums() {
  const dirents = await fs.readdir(MUSIC_ROOT, { withFileTypes: true });
  const albums = [];

  for (const d of dirents) {
    if (!d.isDirectory()) continue;

    const albumDir = path.join(MUSIC_ROOT, d.name);
    const coverDir = path.join(albumDir, "cover");
    const tracksDir = path.join(albumDir, "tracks");
    const tracksWavDir = path.join(tracksDir, "wav");
    const notesFile = path.join(albumDir, "notes", "notes");
    const playlistsDir = path.join(albumDir, "playlists");
    const playlistM3uPath = path.join(playlistsDir, "full.m3u");
    const playlistM3u8Path = path.join(playlistsDir, "full.m3u8");
    const previewM3uPath = path.join(playlistsDir, "preview.m3u");
    const previewM3u8Path = path.join(playlistsDir, "preview.m3u8");

    const fullPlaylistEntries = await readPlaylistEntries(playlistM3u8Path);
    const previewPlaylistEntries = await readPlaylistEntries(previewM3u8Path);

    let coverPath = null;
    try {
      const covers = (await fs.readdir(coverDir))
        .filter((f) => COVER_EXT.has(path.extname(f).toLowerCase()) && !/^cover-preview\./i.test(f))
        .sort(sortTracksNatural);
      if (covers.length > 0) {
        coverPath = path.join(coverDir, covers[0]);
      }
    } catch {
      coverPath = null;
    }

    let tracksSourceDir = tracksDir;
    try {
      const wavStat = await fs.stat(tracksWavDir);
      if (wavStat.isDirectory()) {
        tracksSourceDir = tracksWavDir;
      }
    } catch {
      tracksSourceDir = tracksDir;
    }

    const tracks = [];
    let trackFiles = [];

    try {
      trackFiles = (await fs.readdir(tracksSourceDir))
        .filter((f) => TRACK_EXT.has(path.extname(f).toLowerCase()))
        .sort(sortTracksNatural);
    } catch {
      trackFiles = [];
    }

    const numberedTracks = trackFiles.filter((name) => /^\s*\d+\s*-\s*/.test(name));
    const selectedTracks =
      numberedTracks.length > 0
        ? trackFiles.filter((name) => /^\s*\d+\s*-\s*/.test(name) || /^master\./i.test(name))
        : trackFiles;

    if (selectedTracks.length > 0) {
      if (fullPlaylistEntries.length === 0) {
        throw new Error(
          `Missing full.m3u8 playlist for release "${d.name}". Run: npm run optimize:media`
        );
      }

      if (selectedTracks.length !== fullPlaylistEntries.length) {
        throw new Error(
          `Track count mismatch in "${d.name}": sources=${selectedTracks.length}, full.m3u8=${fullPlaylistEntries.length}`
        );
      }
    }

    for (const [index, fileName] of selectedTracks.entries()) {
      const playlistTrack = fullPlaylistEntries[index];
      const previewPlaylistTrack = previewPlaylistEntries[index] ?? null;

      if (!playlistTrack) {
        throw new Error(`Missing playlist track #${index + 1} in "${d.name}"`);
      }

      const abs = path.join(tracksSourceDir, fileName);
      const stat = await fs.stat(abs);
      const sourceFilePath = path.relative(albumDir, abs).split(path.sep).join("/");
      const safeStem = toSafeTrackStem(fileName);
      const previewAbs = path.join(tracksDir, "preview", `${safeStem}.ogg`);
      let previewUrl = null;
      if (previewPlaylistTrack) {
        previewUrl = previewPlaylistTrack.url;
      } else if (await exists(previewAbs)) {
        previewUrl = toPublicUrl(previewAbs);
      }

      tracks.push({
        fileName,
        safeStem,
        title: playlistTrack.title || normalizeTrackTitle(fileName),
        url: playlistTrack.url,
        sourceFilePath,
        sizeBytes: stat.size,
        previewUrl
      });
    }

    let notes = "";
    try {
      notes = (await fs.readFile(notesFile, "utf8")).trim();
    } catch {
      notes = "";
    }

    let releaseDate = parseReleaseDateFromNotes(notes);
    if (!releaseDate) {
      try {
        const stat = await fs.stat(notesFile);
        releaseDate = formatDate(stat.mtime);
      } catch {
        const stat = await fs.stat(albumDir);
        releaseDate = formatDate(stat.mtime);
      }
    }

    const coverPreviewPath = path.join(coverDir, "cover-preview.webp");

    albums.push({
      slug: slugify(d.name),
      albumName: d.name,
      sourceDirName: d.name,
      coverUrl: coverPath ? toPublicUrl(coverPath) : "/media/background/bg.jpg",
      coverPreviewUrl: (await exists(coverPreviewPath)) ? toPublicUrl(coverPreviewPath) : null,
      releaseDate,
      notes,
      genre: {
        en: "Electronic",
        ru: "Электроника"
      },
      playlistM3uUrl: (await exists(playlistM3uPath)) ? toPublicUrl(playlistM3uPath) : null,
      playlistM3u8Url: (await exists(playlistM3u8Path)) ? toPublicUrl(playlistM3u8Path) : null,
      previewPlaylistM3uUrl: (await exists(previewM3uPath)) ? toPublicUrl(previewM3uPath) : null,
      previewPlaylistM3u8Url: (await exists(previewM3u8Path)) ? toPublicUrl(previewM3u8Path) : null,
      tracks
    });
  }

  albums.sort(sortAlbums);
  return albums;
}

function buildServerReleaseData(albums) {
  return albums.map((album) => ({
    slug: album.slug,
    albumName: album.albumName,
    sourceDirName: album.sourceDirName,
    coverUrl: album.coverUrl,
    releaseDate: album.releaseDate,
    tracks: album.tracks.map((track, index) => ({
      index: index + 1,
      title: track.title,
      fileName: track.fileName,
      sourceFilePath: track.sourceFilePath,
      sizeBytes: track.sizeBytes
    }))
  }));
}

function buildClientReleaseManifest(albums) {
  return {
    generatedAt: new Date().toISOString(),
    releases: albums.map((album) => ({
      slug: album.slug,
      albumName: album.albumName,
      sourceDirName: album.sourceDirName,
      coverUrl: album.coverUrl,
      coverPreviewUrl: album.coverPreviewUrl,
      releaseDate: album.releaseDate,
      notes: album.notes,
      genre: album.genre,
      playlistM3uUrl: album.playlistM3uUrl,
      playlistM3u8Url: album.playlistM3u8Url,
      previewPlaylistM3uUrl: album.previewPlaylistM3uUrl,
      previewPlaylistM3u8Url: album.previewPlaylistM3u8Url,
      tracks: album.tracks.map((track, index) => ({
        index: index + 1,
        title: track.title,
        url: track.url,
        previewUrl: track.previewUrl
      }))
    }))
  };
}

function buildMdxTrackListValue(tracks) {
  const items = tracks.map((track) =>
    [
      "  {",
      `    "title": ${JSON.stringify(track.title)},`,
      `    "url": ${JSON.stringify(track.url)}`,
      "  }"
    ].join("\n")
  );

  return `tracks={[\n${items.join(",\n")}\n]}`;
}

async function syncReleaseMdxTrackUrls(albums) {
  const langs = ["en", "ru"];
  let updatedFiles = 0;

  for (const lang of langs) {
    const releasesDir = path.join(RELEASE_MDX_ROOT, lang, "releases");

    for (const album of albums) {
      const filePath = path.join(releasesDir, `${album.slug}.mdx`);
      if (!(await exists(filePath))) continue;

      const source = await fs.readFile(filePath, "utf8");
      const withVuePlayerImport = source.replace(
        /^import\s+ReleasePlayer\s+from\s+["']@\/components\/ReleasePlayer(?:\.[^"']+)?["'];?$/m,
        'import ReleasePlayer from "@/components/ReleasePlayer.vue";'
      );
      const withVueLikeClassAttr = withVuePlayerImport.replace(/\bclassName=/g, "class=");

      const replacedTracks = withVueLikeClassAttr.replace(
        /tracks=\{\[[\s\S]*?\]\}/m,
        buildMdxTrackListValue(album.tracks)
      );

      if (replacedTracks !== source) {
        await fs.writeFile(filePath, replacedTracks);
        updatedFiles += 1;
      }
    }
  }

  return updatedFiles;
}

async function main() {
  const albums = await readAlbums();
  const syncedMdxFiles = await syncReleaseMdxTrackUrls(albums);

  await fs.mkdir(path.dirname(GENERATED_RELEASE_DATA), { recursive: true });
  await fs.writeFile(GENERATED_RELEASE_DATA, JSON.stringify(buildServerReleaseData(albums), null, 2));

  await fs.mkdir(path.dirname(GENERATED_RELEASE_MANIFEST), { recursive: true });
  await fs.writeFile(
    GENERATED_RELEASE_MANIFEST,
    JSON.stringify(buildClientReleaseManifest(albums), null, 2)
  );

  console.log(`Generated ${albums.length} releases`);
  console.log(`Synced ${syncedMdxFiles} MDX release files`);
  for (const album of albums) {
    console.log(`- ${album.albumName} -> ${album.slug} (${album.tracks.length} tracks)`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
