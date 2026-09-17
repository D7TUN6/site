import { rm } from 'node:fs/promises'
import path from 'node:path'
import { CacheIndex } from './lib/cache-index.js'
import type { AudioEngineConfig } from './lib/audio-config.js'

const ROOT = process.cwd()

async function runJanitorCycle(
  index: CacheIndex,
  config: AudioEngineConfig['cache'],
) {
  const stale = index.getStale(config.staleThresholdMs, 'derived')
  if (stale.length === 0) return

  for (const entry of stale) {
    const dir = path.resolve(ROOT, 'public', 'media', 'music', entry.albumDir, 'tracks', 'cache', entry.cacheKey)
    await rm(dir, { recursive: true, force: true }).catch(() => {})
    index.remove(entry.cacheKey)
  }
  await index.persist()
}

export function startJanitor(
  index: CacheIndex,
  config: AudioEngineConfig['cache'],
) {
  if (!config.janitorEnabled) return
  runJanitorCycle(index, config).catch(e => console.error('janitor initial cycle failed', e))
  setInterval(
    () => runJanitorCycle(index, config).catch(e => console.error('janitor cycle failed', e)),
    config.janitorIntervalMs,
  ).unref()
}
