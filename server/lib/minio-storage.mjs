import { spawn } from "node:child_process";

const MINIO_ALIAS = process.env.MINIO_ALIAS || "local";
const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || "http://127.0.0.1:9000";
const MINIO_BUCKET = process.env.MINIO_BUCKET || "media";
const MINIO_ROOT_USER = process.env.MINIO_ROOT_USER || "minioadmin";
const MINIO_ROOT_PASSWORD = process.env.MINIO_ROOT_PASSWORD || "minioadmin123";

let minioReadyPromise = null;

function runMc(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn("mc", args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    const stderr = [];

    proc.stdout.on("data", () => {});
    proc.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));

    proc.on("error", (error) => {
      reject(new Error(`mc start failed: ${error.message}`));
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      const details = Buffer.concat(stderr).toString("utf8").trim();
      reject(new Error(details || `mc exited with code ${code}`));
    });
  });
}

export function buildMinioObjectUrl(objectKey) {
  return `/media-cache/${objectKey}`;
}

export async function ensureMinioReady() {
  if (!minioReadyPromise) {
    minioReadyPromise = (async () => {
      await runMc(["alias", "set", MINIO_ALIAS, MINIO_ENDPOINT, MINIO_ROOT_USER, MINIO_ROOT_PASSWORD]);
      await runMc(["mb", "--ignore-existing", `${MINIO_ALIAS}/${MINIO_BUCKET}`]);
      await runMc(["anonymous", "set", "download", `${MINIO_ALIAS}/${MINIO_BUCKET}`]);
    })().catch((error) => {
      minioReadyPromise = null;
      throw error;
    });
  }

  return minioReadyPromise;
}

export async function minioObjectExists(objectKey) {
  await ensureMinioReady();

  try {
    await runMc(["stat", `${MINIO_ALIAS}/${MINIO_BUCKET}/${objectKey}`]);
    return true;
  } catch {
    return false;
  }
}

export async function uploadFileToMinio(localPath, objectKey) {
  await ensureMinioReady();
  await runMc(["cp", localPath, `${MINIO_ALIAS}/${MINIO_BUCKET}/${objectKey}`]);
}

export async function mirrorDirectoryToMinio(localDir, objectPrefix, { excludePatterns = [] } = {}) {
  await ensureMinioReady();

  const args = [
    "mirror",
    "--overwrite",
    "--remove",
  ];

  for (const pattern of excludePatterns) {
    args.push("--exclude", pattern);
  }

  args.push(localDir, `${MINIO_ALIAS}/${MINIO_BUCKET}/${objectPrefix}`);
  await runMc(args);
}

export function getMinioBucketName() {
  return MINIO_BUCKET;
}

export function getMinioAliasName() {
  return MINIO_ALIAS;
}
