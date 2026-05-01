import { buildMinioObjectUrl } from "./minio-storage.mjs";

export function buildReleaseMusicObjectPrefix(release) {
  return `music/${release.sourceDirName}`;
}

export function buildReleaseTrackDownloadObjectKey(release, track, format) {
  return `${buildReleaseMusicObjectPrefix(release)}/tracks/download/${format}/${track.safeStem}.${format}`;
}

export function buildReleaseTrackDownloadUrl(release, track, format) {
  return buildMinioObjectUrl(buildReleaseTrackDownloadObjectKey(release, track, format));
}

export function buildReleaseArchiveObjectKey(release, format) {
  return `releases/zips/${release.slug}/${release.slug}-${format}.zip`;
}

export function buildReleaseArchiveUrl(release, format) {
  return buildMinioObjectUrl(buildReleaseArchiveObjectKey(release, format));
}
