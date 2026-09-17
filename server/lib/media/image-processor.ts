import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { runFfmpeg } from './ffmpeg-pool.js'

export const IMAGE_CONVERT_EXTS = new Set(['.jpg', '.jpeg', '.png', '.tiff', '.bmp'])

// sharp is a native (libvips) module that needs libstdc++ at runtime. Load it
// lazily so importing this module never hard-fails on platforms where the C++
// runtime isn't on the loader path; errors surface only when image ops are used.
async function loadSharp(): Promise<typeof import('sharp').default> {
  const mod = await import('sharp')
  return mod.default
}

export async function processGalleryImage(src: string, destDir: string): Promise<{ webp: string; preview: string; avif: string }> {
  const sharp = await loadSharp()
  const ext = path.extname(src).toLowerCase()
  const base = path.basename(src, ext)
  const webpFilename = `${base}.webp`
  const avifFilename = `${base}.avif`
  const previewFilename = `${base}-preview.webp`

  const webpPath = path.join(destDir, webpFilename)
  const avifPath = path.join(destDir, avifFilename)
  const previewPath = path.join(destDir, previewFilename)

  if (IMAGE_CONVERT_EXTS.has(ext)) {
    await sharp(src).webp({ quality: 82 }).toFile(webpPath)
    await sharp(src).avif({ quality: 65 }).toFile(avifPath).catch(() => {})
    await rm(src, { force: true })
  } else if (ext === '.webp') {
    await sharp(src).avif({ quality: 65 }).toFile(avifPath).catch(() => {})
  }

  await sharp(webpPath || src)
    .resize(400)
    .webp({ quality: 70 })
    .toFile(previewPath)

  return { webp: webpFilename, preview: previewFilename, avif: avifFilename }
}

export async function processCoverImage(src: string, destDir: string): Promise<{ webp: string; preview: string }> {
  const sharp = await loadSharp()
  const ext = path.extname(src).toLowerCase()
  const base = path.basename(src, ext)
  const webpFilename = `${base}.webp`
  const previewFilename = `${base}-preview.webp`

  const webpPath = path.join(destDir, webpFilename)
  const previewPath = path.join(destDir, previewFilename)

  if (IMAGE_CONVERT_EXTS.has(ext)) {
    await sharp(src).webp({ quality: 85 }).toFile(webpPath)
    await rm(src, { force: true })
  }

  await sharp(webpPath || src)
    .resize(400)
    .webp({ quality: 70 })
    .toFile(previewPath)

  return { webp: webpFilename, preview: previewFilename }
}

export async function generateVideoThumbnail(src: string, destDir: string, atSeconds?: number): Promise<string> {
  const ext = path.extname(src).toLowerCase()
  const base = path.basename(src, ext)
  const suffix = atSeconds != null ? `-thumb-${Math.round(atSeconds)}s` : '-thumb'
  const thumbFilename = `${base}${suffix}.webp`
  const thumbPath = path.join(destDir, thumbFilename)

  const args = ['-y', '-i', src, '-vf', 'scale=640:-1', '-vframes', '1']
  if (atSeconds != null) {
    args.splice(2, 0, '-ss', String(atSeconds))
  }
  args.push(thumbPath)

  await runFfmpeg(args)

  return thumbFilename
}

export async function generateVideoThumbnails(src: string, destDir: string): Promise<string[]> {
  const ext = path.extname(src).toLowerCase()
  const base = path.basename(src, ext)
  const thumbFilenames: string[] = []

  let duration = 0
  try {
    const output = await new Promise<string>((resolve, reject) => {
      const ff = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', src], { timeout: 15000 })
      let data = ''
      ff.stdout.on('data', (c: Buffer) => { data += c.toString() })
      ff.on('error', reject)
      ff.on('close', (code) => { if (code === 0) resolve(data); else reject(new Error(`ffprobe exit ${code}`)) })
    })
    duration = parseFloat(output.trim())
  } catch { /* ok */ }

  if (duration <= 0) duration = 30

  const positions = [0.1, 0.5, 0.9]
  for (const pct of positions) {
    const atSeconds = Math.round(duration * pct)
    const fname = `${base}-thumb-${Math.round(pct * 100)}pct.webp`
    const thumbPath = path.join(destDir, fname)
    try {
      await runFfmpeg([
        '-y', '-ss', String(atSeconds), '-i', src,
        '-vf', 'scale=640:-1',
        '-vframes', '1',
        thumbPath,
      ])
      thumbFilenames.push(fname)
    } catch { /* skip */ }
  }

  return thumbFilenames
}
