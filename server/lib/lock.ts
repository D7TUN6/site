import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'

const LOCK_DIR = '/tmp/d7tun6-locks'

export async function withLock<T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs = 300_000,
): Promise<T> {
  const lockPath = path.join(LOCK_DIR, `audio-${key}.lock`)
  await mkdir(LOCK_DIR, { recursive: true }).catch(() => {})
  try {
    await mkdir(lockPath)
  } catch {
    throw new Error(`Lock held: ${key}`)
  }
  const timer = setTimeout(() => rm(lockPath, { recursive: true, force: true }).catch(() => {}), ttlMs)
  try {
    return await fn()
  } finally {
    clearTimeout(timer)
    await rm(lockPath, { recursive: true, force: true }).catch(() => {})
  }
}

export function lockKeyForRelease(cacheKey: string): string {
  return `release:${cacheKey}`
}

export function lockKeyForTrack(cacheKey: string, trackIndex: number): string {
  return `track:${cacheKey}:${trackIndex}`
}
