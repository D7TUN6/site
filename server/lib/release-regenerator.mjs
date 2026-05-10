// Regenerates both server/generated/release-download-data.json
// and src/generated/release-manifest.json by reusing the existing
// scripts/release-pipeline/* modules.
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const ROOT = path.resolve(__dirname, "..", "..");

export async function regenerateManifests() {
  // Dynamic import so the pipeline modules resolve relative to the project root.
  const { readAlbums } = await import(`${ROOT}/scripts/release-pipeline/reader.mjs`);
  const { buildClientReleaseManifest, buildServerReleaseData } = await import(`${ROOT}/scripts/release-pipeline/writer.mjs`);
  const { GENERATED_RELEASE_DATA, GENERATED_RELEASE_MANIFEST } = await import(`${ROOT}/scripts/release-pipeline/shared.mjs`);

  const albums = await readAlbums();

  await fs.mkdir(path.dirname(GENERATED_RELEASE_DATA), { recursive: true });
  await fs.writeFile(GENERATED_RELEASE_DATA, JSON.stringify(buildServerReleaseData(albums), null, 2));

  await fs.mkdir(path.dirname(GENERATED_RELEASE_MANIFEST), { recursive: true });
  await fs.writeFile(GENERATED_RELEASE_MANIFEST, JSON.stringify(buildClientReleaseManifest(albums), null, 2));

  return albums;
}

export async function generateReleaseMdx(album) {
  const { generateReleaseMdx: _gen } = await import(`${ROOT}/scripts/release-pipeline/writer.mjs`);
  return _gen(album);
}

export async function regenerateContentManifest() {
  const { buildContentManifest, GENERATED_CONTENT_MANIFEST } = await import(`${ROOT}/scripts/generate-content.mjs`);
  const manifest = await buildContentManifest();
  await fs.mkdir(path.dirname(GENERATED_CONTENT_MANIFEST), { recursive: true });
  await fs.writeFile(GENERATED_CONTENT_MANIFEST, JSON.stringify(manifest, null, 2));
}
