import { promises as fs } from "node:fs";
import path from "node:path";
import { RELEASE_MDX_ROOT } from "./shared.mjs";

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

export function buildServerReleaseData(albums) {
  return albums.map((album) => ({
    slug: album.slug,
    albumName: album.albumName,
    sourceDirName: album.sourceDirName,
    coverUrl: album.coverUrl,
    releaseDate: album.releaseDate,
    availableDownloadFormats: album.availableDownloadFormats,
    tracks: album.tracks.map((track, index) => ({
      index: index + 1,
      title: track.title,
      fileName: track.fileName,
      sourceFilePath: track.sourceFilePath,
      sizeBytes: track.sizeBytes,
      safeStem: track.safeStem,
      availableDownloadFormats: track.availableDownloadFormats
    }))
  }));
}

export function buildClientReleaseManifest(albums) {
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
      availableDownloadFormats: album.availableDownloadFormats,
      tracks: album.tracks.map((track, index) => ({
        index: index + 1,
        title: track.title,
        url: track.url,
        streamUrl: track.streamUrl,
        sourceUrl: track.sourceUrl,
        previewUrl: track.previewUrl,
        duration: track.duration,
        availableDownloadFormats: track.availableDownloadFormats,
        links: track.links
      })),
      links: album.links
    }))
  };
}

export async function syncReleaseMdxTrackUrls(albums) {
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

async function exists(pathToCheck) {
  try {
    await fs.access(pathToCheck);
    return true;
  } catch {
    return false;
  }
}
