import { existsSync } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

let cacheRoot = null;

export function initLocalCache(root) {
  cacheRoot = path.join(root, "public", "media");
}

export function getCacheRoot() {
  if (!cacheRoot) throw new Error("Local cache not initialized");
  return cacheRoot;
}

export function buildCachedFilePath(objectKey) {
  if (!cacheRoot) throw new Error("Local cache not initialized");
  return path.join(cacheRoot, objectKey);
}

export function buildCachedFileUrl(objectKey) {
  return `/media/${objectKey}`;
}

export function cachedFileExists(objectKey) {
  return existsSync(buildCachedFilePath(objectKey));
}

export async function saveToCacheFromFile(localPath, objectKey) {
  const dest = buildCachedFilePath(objectKey);
  await mkdir(path.dirname(dest), { recursive: true });
  await copyFile(localPath, dest);
}
