import { promises as fs } from "node:fs";
import path from "node:path";
import {
  COVER_EXT,
  DOWNLOAD_FORMATS,
  MUSIC_ROOT,
  slugify,
  exists,
  formatDate,
  getAudioDurationSeconds,
  normalizeTrackTitle,
  parseReleaseDateFromNotes,
  readPlaylistEntries,
  readReleaseLinks,
  sortAlbums,
  sortTracksNatural,
  toPublicUrl,
  toSafeTrackStem,
  getAvailableDownloadFormatsForSourceExt
} from "./shared.mjs";

export async function readAlbums() {
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
    const releaseLinks = await readReleaseLinks(albumDir);

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
    const trackFiles = await fs
      .readdir(tracksSourceDir)
      .then((entries) =>
        entries
          .filter((f) => /\.(wav|mp3|flac|ogg|m4a|aac)$/i.test(f))
          .sort(sortTracksNatural)
      )
      .catch(() => []);

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
      const duration = await getAudioDurationSeconds(abs);
      const sourceFilePath = path.relative(albumDir, abs).split(path.sep).join("/");
      const safeStem = toSafeTrackStem(fileName);
      const previewAbs = path.join(tracksDir, "preview", `${safeStem}.ogg`);
      const streamPlaylistAbs = path.join(tracksDir, "stream", safeStem, "index.m3u8");
      const availableDownloadFormats = getAvailableDownloadFormatsForSourceExt(fileName);
      let previewUrl = null;
      if (previewPlaylistTrack) {
        previewUrl = previewPlaylistTrack.url;
      } else if (await exists(previewAbs)) {
        previewUrl = toPublicUrl(previewAbs);
      }

      let streamUrl = null;
      if (playlistTrack.url) {
        streamUrl = playlistTrack.url;
      } else if (await exists(streamPlaylistAbs)) {
        streamUrl = toPublicUrl(streamPlaylistAbs);
      }

      const normalizedTitle = playlistTrack.title || normalizeTrackTitle(fileName);
      const trackLinks =
        releaseLinks.tracks[fileName] ??
        releaseLinks.tracks[normalizedTitle] ??
        releaseLinks.tracks[safeStem] ??
        {
          spotify: null,
          yandexMusic: null,
          bandcamp: null,
          soundcloud: null
        };

      tracks.push({
        fileName,
        safeStem,
        title: normalizedTitle,
        url: streamUrl || playlistTrack.url,
        streamUrl,
        sourceUrl: toPublicUrl(abs),
        sourceFilePath,
        sizeBytes: stat.size,
        previewUrl,
        duration,
        availableDownloadFormats,
        links: trackLinks
      });
    }

    const notes = await fs
      .readFile(notesFile, "utf8")
      .then((value) => value.trim())
      .catch(() => "");

    // Read release metadata (type and date)
    const metaPath = path.join(albumDir, "release-meta.json");
    let releaseType = "album";
    let releaseDate = null;
    try {
      const metaRaw = await fs.readFile(metaPath, "utf8");
      const meta = JSON.parse(metaRaw);
      if (meta.releaseType) releaseType = meta.releaseType;
      if (meta.releaseDate) releaseDate = meta.releaseDate;
    } catch {
      // meta file doesn't exist, use defaults
    }

    // Fallback: parse date from notes if not in metadata
    if (!releaseDate) {
      releaseDate = parseReleaseDateFromNotes(notes);
    }

    // Fallback: use file modification time
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
      releaseType,
      notes,
      genre: {
        en: "Electronic",
        ru: "Электроника"
      },
      playlistM3uUrl: (await exists(playlistM3uPath)) ? toPublicUrl(playlistM3uPath) : null,
      playlistM3u8Url: (await exists(playlistM3u8Path)) ? toPublicUrl(playlistM3u8Path) : null,
      previewPlaylistM3uUrl: (await exists(previewM3uPath)) ? toPublicUrl(previewM3uPath) : null,
      previewPlaylistM3u8Url: (await exists(previewM3u8Path)) ? toPublicUrl(previewM3u8Path) : null,
      availableDownloadFormats: DOWNLOAD_FORMATS.filter((format) =>
        tracks.length > 0 && tracks.every((track) => track.availableDownloadFormats.includes(format))
      ),
      tracks,
      links: releaseLinks.release
    });
  }

  albums.sort(sortAlbums);
  return albums;
}
