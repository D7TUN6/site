// Optimizes a source image into the background variants used by the site:
//   public/media/background/bg.jpg
//   public/media/background/bg-960.avif / bg-1440.avif
//   public/media/background/bg-960.webp / bg-1440.webp
//
// Usage: node scripts/generate-bg.mjs <source-image>
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
export const BG_DIR = path.join(ROOT, "public", "media", "background");
export const BG_OLD_DIR = path.join(BG_DIR, "old");

async function runFfmpeg(args) {
  await new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", ["-y", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    const stderr = [];
    proc.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    proc.on("error", (err) => reject(new Error(`ffmpeg start failed: ${err.message}`)));
    proc.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(Buffer.concat(stderr).toString("utf8").trim() || `ffmpeg exited ${code}`));
    });
  });
}

async function runFfmpegAvif(args) {
  for (const codec of [["-c:v", "libaom-av1"], ["-c:v", "libsvtav1"]]) {
    try {
      await runFfmpeg([...args, ...codec]);
      return;
    } catch {
      // try next codec
    }
  }
  throw new Error("No AVIF codec available (libaom-av1 or libsvtav1 required)");
}

export async function generateBg(sourcePath) {
  await fs.mkdir(BG_DIR, { recursive: true });

  // bg.jpg — full size JPEG
  await runFfmpeg([
    "-i", sourcePath,
    "-vf", "scale='min(iw,2560)':'min(ih,1440)':force_original_aspect_ratio=decrease",
    "-q:v", "3",
    path.join(BG_DIR, "bg.jpg")
  ]);

  // bg-960.webp / bg-1440.webp
  await runFfmpeg([
    "-i", sourcePath,
    "-vf", "scale=960:-1",
    "-quality", "82",
    path.join(BG_DIR, "bg-960.webp")
  ]);
  await runFfmpeg([
    "-i", sourcePath,
    "-vf", "scale=1440:-1",
    "-quality", "82",
    path.join(BG_DIR, "bg-1440.webp")
  ]);

  // bg-960.avif / bg-1440.avif
  await runFfmpegAvif([
    "-i", sourcePath,
    "-vf", "scale=960:-1",
    "-crf", "32", "-b:v", "0",
    path.join(BG_DIR, "bg-960.avif")
  ]);
  await runFfmpegAvif([
    "-i", sourcePath,
    "-vf", "scale=1440:-1",
    "-crf", "32", "-b:v", "0",
    path.join(BG_DIR, "bg-1440.avif")
  ]);
}

// CLI entry point
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const src = process.argv[2];
  if (!src) {
    console.error("Usage: node scripts/generate-bg.mjs <source-image>");
    process.exit(1);
  }
  generateBg(path.resolve(src)).then(() => {
    console.log("Background generated successfully");
  }).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
