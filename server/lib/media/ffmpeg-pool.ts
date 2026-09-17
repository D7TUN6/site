import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { audioConfig } from '../audio-config.js'

let ffmpegActive = 0
const ffmpegQueue: Array<() => void> = []

export function acquireFfmpegSlot(): Promise<void> {
  if (ffmpegActive < audioConfig.ffmpeg.concurrency) {
    ffmpegActive++
    return Promise.resolve()
  }
  return new Promise<void>((resolve) => {
    ffmpegQueue.push(() => {
      ffmpegActive++
      resolve()
    })
  })
}

export function releaseFfmpegSlot() {
  ffmpegActive--
  if (ffmpegQueue.length > 0) {
    const next = ffmpegQueue.shift()!
    next()
  }
}

export async function exists(p: string): Promise<boolean> {
  try { await access(p); return true } catch { return false }
}

async function runFfmpegGeneric(
  args: string[],
  onProgress?: (pct: number) => void,
  timeoutMs: number = audioConfig.ffmpeg.timeoutMs,
  signal?: AbortSignal,
): Promise<void> {
  await acquireFfmpegSlot()
  let didKill = false
  let settled = false
  let ff: ReturnType<typeof spawn> | null = null
  let ffChildPid: number | undefined
  let timer: ReturnType<typeof setTimeout> | null = null
  let sigkillTimer: ReturnType<typeof setTimeout> | null = null

  // Kill an ffmpeg invocation including its `nice` wrapper and any
  // grandchildren. The child is spawned as a detached process-group leader so
  // -pid kills the whole tree; otherwise killing `nice` would leave the real
  // ffmpeg orphaned and it would keep burning CPU.
  const killProcess = () => {
    didKill = true
    const child = ff
    if (!child) return
    try { process.kill(-ffChildPid!, 'SIGTERM') } catch { /* group already gone */ }
    try { child.kill('SIGTERM') } catch { /* already gone */ }
    sigkillTimer = setTimeout(() => {
      try { process.kill(-ffChildPid!, 'SIGKILL') } catch { /* group already gone */ }
      try { child.kill('SIGKILL') } catch { /* already gone */ }
    }, 5000)
    sigkillTimer.unref?.()
  }

  const settle = (fn: () => void) => {
    if (settled) return
    settled = true
    if (timer) clearTimeout(timer)
    if (sigkillTimer) clearTimeout(sigkillTimer)
    if (signal) signal.removeEventListener('abort', killProcess)
    fn()
  }

  try {
    await new Promise<void>((resolve, reject) => {
      const ffArgs = onProgress
        ? ['-hide_banner', '-loglevel', 'error', '-progress', 'pipe:1', ...args]
        : ['-hide_banner', '-loglevel', 'error', ...args]
      const [cmd, cmdArgs] = ffmpegSpawnCommand()
      let mappedArgs = ffArgs
      if (audioConfig.ffmpeg.threads != null && audioConfig.ffmpeg.threads > 0) {
        mappedArgs = ['-threads', String(audioConfig.ffmpeg.threads), ...ffArgs]
      }
      const child = spawn(cmd, [...cmdArgs, ...mappedArgs], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
      })
      ff = child
      ffChildPid = child.pid

      const err: Buffer[] = []
      child.stderr!.on('data', (c) => err.push(Buffer.from(c)))
      child.on('error', (e) => settle(() => reject(e)))
      child.on('close', (code) => {
        if (didKill) {
          settle(() => reject(new Error('ffmpeg process was terminated')))
          return
        }
        if (code === 0) settle(resolve)
        else settle(() => reject(new Error(Buffer.concat(err).toString('utf8') || `ffmpeg exit ${code}`)))
      })

      if (onProgress) {
        let lastPct = -1
        child.stdout!.on('data', (c: Buffer) => {
          const text = c.toString('utf8')
          let outTimeUs = 0
          let durationUs = 0
          for (const line of text.split('\n')) {
            if (line.startsWith('out_time_us=')) outTimeUs = Number(line.split('=')[1]) || 0
            else if (line.startsWith('duration=')) durationUs = parseFloat(line.split('=')[1]) * 1_000_000 || 0
          }
          if (durationUs > 0) {
            const pct = Math.min(1, outTimeUs / durationUs)
            if (pct - lastPct >= 0.01 || pct >= 1) {
              lastPct = pct
              onProgress(pct)
            }
          }
        })
      }

      timer = setTimeout(() => {
        killProcess()
        settle(() => reject(new Error(`ffmpeg killed after ${timeoutMs}ms timeout`)))
      }, timeoutMs)

      if (signal) {
        if (signal.aborted) {
          killProcess()
          settle(() => reject(new DOMException('Aborted', 'AbortError')))
        } else {
          signal.addEventListener('abort', killProcess, { once: true })
        }
      }
    })
  } finally {
    ff = null
    releaseFfmpegSlot()
  }
}

export const runFfmpegWithProgress = runFfmpegGeneric
export const runFfmpeg = (args: string[], timeoutMs?: number, signal?: AbortSignal) => runFfmpegGeneric(args, undefined, timeoutMs, signal)

// Build the wrapper prefix that sets CPU/IO priority for each ffmpeg launch.
// `nice` and `ionice` chain: nice adjusts the SCHED_OTHER prio, ionice the
// block-IO class so conversions neither starve the server nor get starved by
// it. Returns [command, args] so spawn() keeps a known PID to process-kill.
//
// The wrapper is optional: on hosts/sandboxes where `nice`/`ionice` are
// missing (or outside PATH) it degrades gracefully to a plain ffmpeg spawn
// instead of failing every conversion with `nice: 'ionice': No such file`.
const _binaryCache = new Map<string, boolean>()

function haveBinary(name: string): boolean {
  const cached = _binaryCache.get(name)
  if (cached !== undefined) return cached
  const pathDirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean)
  const ok = pathDirs.some((dir) => {
    try { return existsSync(path.join(dir, name)) } catch { return false }
  })
  _binaryCache.set(name, ok)
  return ok
}

export function ffmpegSpawnCommand(): [string, string[]] {
  const cfg = audioConfig.ffmpeg
  const ioniceOk = haveBinary('ionice')
  const niceOk = haveBinary('nice')

  const wrapper: string[] = []
  if (ioniceOk) {
    if (cfg.ioClass === 'realtime') wrapper.push('ionice', '-c1', '-n0')
    else if (cfg.ioClass === 'idle') wrapper.push('ionice', '-c3')
    else wrapper.push('ionice', '-c2', '-n0')
  }
  if (niceOk) wrapper.unshift('nice', '-n', String(cfg.niceLevel))

  const argv = [...wrapper, cfg.path]
  return [argv[0], argv.slice(1)]
}