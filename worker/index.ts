import { createClient, commandOptions } from 'redis'
import { spawn } from 'node:child_process'
import { mkdir, rm, readFile, writeFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { isPreOrder, isTrackLocked } from '../server/lib/release-availability.js'

// ---- env ----
const REDIS_URL = process.env.REDIS_URL || ''
const ROOT = process.cwd()
const WORKER_ID = process.env.WORKER_ID || `worker-${crypto.randomUUID().slice(0, 8)}`
const WORKER_TMP_DIR = process.env.WORKER_TMP_DIR || '/tmp/worker'

if (!REDIS_URL) { console.error('missing REDIS_URL'); process.exit(1) }

const log = {
  info: (msg: string, data?: unknown) => console.log(JSON.stringify({ level: 'info', worker: WORKER_ID, msg, ...(data !== undefined ? { data } : {}) })),
  error: (msg: string, data?: unknown) => console.error(JSON.stringify({ level: 'error', worker: WORKER_ID, msg, ...(data !== undefined ? { data } : {}) })),
  warn: (msg: string, data?: unknown) => console.warn(JSON.stringify({ level: 'warn', worker: WORKER_ID, msg, ...(data !== undefined ? { data } : {}) })),
}

// ---- local file helpers ----
function resolvePublicPath(relativePath: string): string {
  return path.join(ROOT, 'public', relativePath.replace(/^\/+/, ''))
}

async function localCopy(srcRelative: string, dest: string): Promise<void> {
  const src = resolvePublicPath(srcRelative)
  const data = await readFile(src)
  await writeFile(dest, data)
}

// ---- redis client with reconnect ----
async function createRedisClient(): Promise<ReturnType<typeof createClient>> {
  const client = createClient({
    url: REDIS_URL,
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 20) {
          log.error('redis reconnect exhausted')
          return new Error('Redis reconnect exhausted')
        }
        const delay = Math.min(retries * 100, 5000)
        log.warn('redis reconnecting', { retries, delay })
        return delay
      },
    },
  })
  client.on('error', (err) => log.error('redis client error', { error: String(err) }))
  await client.connect()
  return client
}

// ---- ffmpeg helpers ----
// Concurrency and CPU priority match machine speed rather than being buried in
// code: an rt-bore/performance-governor box has plenty of threads to convert
// faster than 4-at-once at nice 19. Tune per host via env; defaults are sane
// for a shared-server box.
const MAX_CONCURRENT = Number(process.env.WORKER_MAX_CONCURRENT || '4')
const FFMPEG_NICE = Number(process.env.WORKER_FFMPEG_NICE || '0')
let active = 0
const queue: Array<() => void> = []

async function acquire() {
  if (active < MAX_CONCURRENT) { active++; return }
  await new Promise<void>((r) => queue.push(() => { active++; r() }))
}
function release() {
  active--
  queue.shift()?.()
}

function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const ff = spawn('nice', ['-n', String(FFMPEG_NICE), 'ffmpeg', '-hide_banner', '-loglevel', 'error', ...args])
    const err: Buffer[] = []
    ff.stderr.on('data', (c) => err.push(Buffer.from(c)))
    ff.on('error', reject)
    ff.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(Buffer.concat(err).toString('utf8') || `ffmpeg exit ${code}`))
    })
  })
}

function probeDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    const ff = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath])
    let out = ''
    ff.stdout.on('data', (c) => out += String(c))
    ff.on('close', () => resolve(parseFloat(out.trim()) || 0))
  })
}

// ---- types ----
type AudioHlsJob = { slug: string; trackIndex: number; sourceUrl: string }
type VideoHlsJob = { slug: string; sourceUrl: string; filename: string }
type RebuildFrontendJob = { webhookUrl?: string }
type LoudnessScanJob = { trackId: number; sourceUrl: string; releaseSlug: string; trackIndex: number }

const MAX_RETRIES = 3

// ---- job handlers ----

async function handleAudioHls(job: AudioHlsJob) {
  const { slug, trackIndex, sourceUrl } = job
  log.info('hls start', { slug, trackIndex })

  const tmpDir = `${WORKER_TMP_DIR}/${slug}/${trackIndex}`
  await mkdir(tmpDir, { recursive: true })

  const srcName = sourceUrl.split('/').pop() || 'source'
  const srcPath = path.join(tmpDir, srcName)
  await localCopy(sourceUrl, srcPath)

  const ext = path.extname(srcName)
  const stem = path.basename(srcName, ext)
  const hlsDir = path.join(tmpDir, 'hls')
  await mkdir(hlsDir, { recursive: true })

  await acquire()
  try {
    await ffmpeg([
      '-y', '-i', srcPath,
      '-c:a', 'aac', '-b:a', '128k',
      '-f', 'hls', '-hls_time', '6', '-hls_list_size', '0',
      '-hls_segment_filename', path.join(hlsDir, 'segment_%03d.ts'),
      path.join(hlsDir, 'index.m3u8'),
    ])
  } finally { release() }

  // copy hls segments to public dir
  const destDir = path.join(ROOT, 'public', 'media', 'music', slug, 'tracks', 'stream', stem)
  await mkdir(destDir, { recursive: true })
  const hlsFiles = await readdir(hlsDir)
  for (const f of hlsFiles) {
    const data = await readFile(path.join(hlsDir, f))
    await writeFile(path.join(destDir, f), data)
  }

  // clean up
  await rm(tmpDir, { recursive: true, force: true })
  log.info('hls done', { slug, trackIndex })
}

async function handleVideoHls(job: VideoHlsJob) {
  const { slug, sourceUrl, filename } = job
  log.info('video hls start', { slug })

  const tmpDir = `${WORKER_TMP_DIR}/video/${slug}`
  await mkdir(tmpDir, { recursive: true })

  const srcPath = path.join(tmpDir, filename)
  await localCopy(sourceUrl, srcPath)

  const hlsDir = path.join(tmpDir, 'hls')
  await mkdir(hlsDir, { recursive: true })

  await acquire()
  try {
    await ffmpeg([
      '-y', '-i', srcPath,
      '-vf', 'scale=-2:720',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '23',
      '-c:a', 'aac', '-b:a', '128k',
      '-af', 'loudnorm=I=-14:LRA=7:TP=-1:print_format=json',
      '-f', 'hls', '-hls_time', '6', '-hls_list_size', '0',
      '-hls_segment_filename', path.join(hlsDir, 'segment_%03d.ts'),
      path.join(hlsDir, 'index.m3u8'),
    ])

    // mp4 download
    await ffmpeg([
      '-y', '-i', srcPath,
      '-vf', 'scale=-2:720',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '23',
      '-c:a', 'aac', '-b:a', '128k',
      '-af', 'loudnorm=I=-14:LRA=7:TP=-1:print_format=json',
      path.join(hlsDir, 'video.mp4'),
    ])

    // thumbnail
    await ffmpeg([
      '-y', '-i', srcPath,
      '-vf', 'scale=640:-1', '-vframes', '1',
      path.join(hlsDir, 'thumb.webp'),
    ])
  } finally { release() }

  // copy to public dir
  const destDir = path.join(ROOT, 'public', 'media', 'video', slug, 'videos')
  await mkdir(destDir, { recursive: true })
  const files = await readdir(hlsDir)
  for (const f of files) {
    const data = await readFile(path.join(hlsDir, f))
    await writeFile(path.join(destDir, f), data)
  }

  await rm(tmpDir, { recursive: true, force: true })
  log.info('video hls done', { slug })
}

async function handleRebuildFrontend(job: RebuildFrontendJob) {
  log.info('rebuild frontend', job)
}

function ffmpegProbeLoudness(filePath: string): Promise<{ integratedLoudness: number; truePeak: number }> {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', [
      '-hide_banner', '-i', filePath,
      '-af', 'ebur128=peak=true',
      '-f', 'null', '-',
    ], { stdio: ['ignore', 'pipe', 'pipe'] })

    let stderr = ''
    ff.stderr.on('data', (c: Buffer) => { stderr += String(c) })
    ff.on('error', reject)
    ff.on('close', (code) => {
      if (code !== 0 && code !== 1) return reject(new Error(stderr || `ffmpeg exit ${code}`))

      let integratedLoudness = -70
      let truePeak = -70
      for (const line of stderr.split('\n')) {
        const t = line.trim()
        const iMatch = t.match(/I:\s+([-\d.]+)\s+LUFS/)
        if (iMatch) integratedLoudness = parseFloat(iMatch[1])
        const tpMatch = t.match(/Peak:\s+([-\d.]+)\s+dBFS/)
        if (tpMatch) truePeak = parseFloat(tpMatch[1])
      }
      if (integratedLoudness === -70) return reject(new Error('Failed to parse loudness'))
      resolve({ integratedLoudness, truePeak })
    })
  })
}

async function handleLoudnessScan(job: LoudnessScanJob) {
  const { trackId, sourceUrl, releaseSlug, trackIndex } = job
  log.info('loudness scan start', { trackId, releaseSlug, trackIndex })

  const tmpDir = `${WORKER_TMP_DIR}/loudness-${trackId}`
  await mkdir(tmpDir, { recursive: true })

  const srcName = sourceUrl.split('/').pop() || 'source'
  const srcPath = path.join(tmpDir, srcName)
  await localCopy(sourceUrl, srcPath)

  await acquire()
  let result: { integratedLoudness: number; truePeak: number }
  try {
    result = await ffmpegProbeLoudness(srcPath)
  } finally {
    release()
    await rm(tmpDir, { recursive: true, force: true })
  }

  log.info('loudness scan done', { trackId, releaseSlug, trackIndex, ...result })

  // Write results to a JSON file for the server to pick up and store in DB
  const resultPath = path.join(ROOT, 'public', 'media', 'music', releaseSlug, 'tracks', `.loudness-${trackIndex}.json`)
  await mkdir(path.dirname(resultPath), { recursive: true })
  await writeFile(resultPath, JSON.stringify(result))

  log.info('loudness result written', { trackId, resultPath })
}

// ---- main loop ----
let redis: ReturnType<typeof createClient> | null = null

async function shutdown(signal: string) {
  log.info('shutting down', { signal })
  await redis?.disconnect().catch(() => {})
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

async function main() {
  log.info('starting worker')

  redis = await createRedisClient()

  const queues = ['audio-hls', 'video-hls', 'rebuild-frontend', 'audio-loudness-scan']

  for (const q of queues) {
    try {
      await redis.sendCommand(['XGROUP', 'CREATE', `v1:queue:${q}`, `worker-${q}`, '$', 'MKSTREAM'])
    } catch (e: any) {
      if (!e.message?.includes('BUSYGROUP')) log.error('group setup', { queue: q, error: e.message })
    }
  }

  const handlers: Record<string, (job: unknown) => Promise<void>> = {
    'audio-hls': handleAudioHls,
    'video-hls': handleVideoHls,
    'rebuild-frontend': handleRebuildFrontend,
    'audio-loudness-scan': handleLoudnessScan,
  }

  log.info('listening on queues', { queues })

  while (true) {
    const promises = queues.map(async (q) => {
      try {
        const result = await redis.xReadGroup(
          commandOptions({ isolated: true }),
          `worker-${q}`, WORKER_ID,
          [{ key: `v1:queue:${q}`, id: '>' }],
          { COUNT: 1, BLOCK: 5000 },
        )
        if (!result || result.length === 0) return

        for (const stream of result) {
          for (const message of stream.messages) {
            let payload: Record<string, unknown>
            try {
              payload = JSON.parse(message.message.payload as string)
            } catch {
              log.error('invalid payload', { queue: q, raw: String(message.message.payload) })
              await redis.xAck(`v1:queue:${q}`, `worker-${q}`, message.id)
              continue
            }
            const retries = Number(payload._retries || 0)
            log.info('processing', { queue: q, payload })
            try {
              await handlers[q](payload)
              await redis.xAck(`v1:queue:${q}`, `worker-${q}`, message.id)
            } catch (e) {
              log.error('failed', { queue: q, error: String(e), retries })
              if (retries < MAX_RETRIES) {
                // Re-queue with incremented retry counter
                const retryPayload = JSON.stringify({ ...payload, _retries: retries + 1 })
                await redis.xAdd(`v1:queue:${q}`, '*', { payload: retryPayload })
              }
              await redis.xAck(`v1:queue:${q}`, `worker-${q}`, message.id)
            }
          }
        }
      } catch (e: any) {
        if (!e.message?.includes('NOSCRIPT') && !e.message?.includes('NOGROUP')) {
          log.error('read error', { queue: q, error: e.message })
        }
        await new Promise(r => setTimeout(r, 1000))
      }
    })
    await Promise.allSettled(promises)
  }
}

main().catch((e) => { log.error('worker fatal', { error: String(e) }); process.exit(1) })
