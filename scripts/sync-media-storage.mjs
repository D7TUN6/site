import { mirrorDirectoryToMinio } from "../server/lib/minio-storage.mjs";
import { ReleaseDownloadService } from "../server/lib/release-download-service.mjs";

const ROOT = process.cwd();
const RELEASE_DATA_PATH = `${ROOT}/server/generated/release-download-data.json`;
const MUSIC_ROOT = `${ROOT}/public/media/music`;
const PREWARM_ARCHIVES = process.argv.includes("--prewarm");

async function main() {
  const service = new ReleaseDownloadService({
    root: ROOT,
    releaseDataPath: RELEASE_DATA_PATH
  });

  await service.bootstrap();

  console.log("Syncing release media to MinIO");
  await mirrorDirectoryToMinio(MUSIC_ROOT, "music", {
    excludePatterns: ["**/tracks/download/**"]
  });

  if (PREWARM_ARCHIVES) {
    console.log("Prewarming release ZIP archives in MinIO");
    await service.prewarmAllArchives();
  }

  console.log("MinIO media sync complete");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
