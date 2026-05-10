import { promises as fs } from "node:fs";
import path from "node:path";
import { GENERATED_RELEASE_DATA, GENERATED_RELEASE_MANIFEST } from "./release-pipeline/shared.mjs";
import { readAlbums } from "./release-pipeline/reader.mjs";
import {
  buildClientReleaseManifest,
  buildServerReleaseData,
  syncReleaseMdxTrackUrls
} from "./release-pipeline/writer.mjs";

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
