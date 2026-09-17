import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { runFfmpeg } from './ffmpeg-pool.js'

export async function convertVideoToHls(src: string, destDir: string, filename: string): Promise<{ playlist: string; thumbnail: string }> {
  const stem = path.basename(filename, path.extname(filename))
  const hlsDir = path.join(destDir, 'hls')
  await mkdir(hlsDir, { recursive: true })

  const playlistPath = path.join(hlsDir, 'index.m3u8')
  const thumbnailPath = path.join(destDir, `${stem}-thumb.webp`)

  await runFfmpeg([
    '-y', '-i', src,
    '-vf', 'scale=-2:720',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '23',
    '-c:a', 'aac', '-b:a', '128k',
    '-f', 'hls', '-hls_time', '6', '-hls_list_size', '0',
    '-hls_segment_filename', path.join(hlsDir, 'segment_%03d.ts'),
    playlistPath,
  ])

  await runFfmpeg([
    '-y', '-i', src,
    '-vf', 'scale=640:-1',
    '-vframes', '1',
    thumbnailPath,
  ])

  await rm(src, { force: true })

  return { playlist: `hls/index.m3u8`, thumbnail: `${stem}-thumb.webp` }
}
