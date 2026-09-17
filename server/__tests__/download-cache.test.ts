import { describe, it, expect, beforeEach, afterAll } from 'bun:test'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { CacheManager } from '../lib/cache-manager.js'
import { isPreOrder, isTrackLocked, parseReleaseDate } from '../lib/release-availability.js'
import type { DownloadOptions } from '../lib/release-download-types.js'

const OPTS: DownloadOptions = {
  format: 'flac',
  sampleRate: 44100,
  bitDepth: 16,
  channels: 2,
  resampler: 'none',
  bitrateMode: 'vbr',
  bitrate: 320,
}

describe('CacheManager.downloadCacheKey variants', () => {
  it('suffixed variants differ for identical options', () => {
    const cm = new CacheManager('/tmp')
    const full = cm.downloadCacheKey('rel', 'dir', OPTS, 3, 'full')
    const pre = cm.downloadCacheKey('rel', 'dir', OPTS, 3, 'preorder')
    expect(full).not.toBe(pre)
    expect(full.endsWith('_v3_full')).toBe(true)
    expect(pre.endsWith('_v3_preorder')).toBe(true)
  })

  it('same variant + options yields a stable key, different version does not', () => {
    const cm = new CacheManager('/tmp')
    const a = cm.downloadCacheKey('rel', 'dir', OPTS, 3, 'full')
    const b = cm.downloadCacheKey('rel', 'dir', OPTS, 3, 'full')
    const c = cm.downloadCacheKey('rel', 'dir', OPTS, 4, 'full')
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })

  it('no variant keeps the legacy key shape', () => {
    const cm = new CacheManager('/tmp')
    const legacy = cm.downloadCacheKey('rel', 'dir', OPTS, 2)
    expect(legacy.endsWith('_v2')).toBe(true)
    expect(legacy.endsWith('_v2_full')).toBe(false)
  })
})

describe('CacheManager garbage collection', () => {
  let root = ''

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'dl-cache-test-'))
  })

  afterAll(async () => {
    await rm(root, { recursive: true, force: true }).catch(() => {})
  })

  it('removes older-version dirs (any variant), junk names, keeps same-version dirs', async () => {
    const { readdir } = await import('node:fs/promises')
    const albumDir = 'album-x'
    const musicDir = path.join(root, 'public', 'media', 'music', albumDir)
    const cacheDir = path.join(musicDir, 'tracks', 'cache')
    await mkdir(cacheDir, { recursive: true })
    await writeFile(path.join(musicDir, '.cache-version'), '5', 'utf8')

    const dirs = {
      current: 'aaaa_v5_preorder',
      newer: 'dddd_v6_full',
      oldFull: 'bbbb_v4_full',
      legacyOld: 'cccc_v1',
      junk: 'not-a-key-dir',
    }
    for (const name of Object.values(dirs)) {
      await mkdir(path.join(cacheDir, name), { recursive: true })
      await writeFile(path.join(cacheDir, name, 'track.flac'), 'x', 'utf8')
    }

    const cm = new CacheManager(root)
    expect(await cm.getCacheVersion('rel-x', albumDir)).toBe(5)

    // bumpCacheVersion is called internally by invalidateCache; use it directly.
    await cm.bumpCacheVersion('rel-x', albumDir)

    const entries = await readdir(cacheDir)
    expect(entries).toContain(dirs.newer)          // version == keep survives
    expect(entries).not.toContain(dirs.current)    // old version swept, even preorder
    expect(entries).not.toContain(dirs.oldFull)
    expect(entries).not.toContain(dirs.legacyOld)  // legacy keys are swept too
    expect(entries).not.toContain(dirs.junk)       // unrecognised names treated as stale

    // version file advanced
    const { readFile } = await import('node:fs/promises')
    expect(await readFile(path.join(musicDir, '.cache-version'), 'utf8')).toBe('6')
  })
})

describe('release availability helpers', () => {
  it('parses dd/mm/yyyy dates to local midnight', () => {
    const d = parseReleaseDate('05/03/2027')
    expect(d).not.toBeNull()
    expect(d!.getFullYear()).toBe(2027)
    expect(d!.getMonth()).toBe(2)
    expect(d!.getDate()).toBe(5)
    expect(d!.getHours()).toBe(0)
    expect(d!.getMinutes()).toBe(0)
  })

  it('rejects malformed and missing dates', () => {
    expect(parseReleaseDate(undefined)).toBeNull()
    expect(parseReleaseDate('')).toBeNull()
    expect(parseReleaseDate('soon')).toBeNull()
    expect(parseReleaseDate('2027-03-05')).toBeNull()
    expect(parseReleaseDate('99/99/2027')).toBeNull()
  })

  it('isPreOrder flips exactly at the release date', () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const fmt = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
    expect(isPreOrder({ releaseDate: fmt(tomorrow) })).toBe(true)
    expect(isPreOrder({ releaseDate: fmt(yesterday) })).toBe(false)
    expect(isPreOrder({})).toBe(false)
  })

  it('isTrackLocked only applies during pre-order to previewable === false', () => {
    const future = { releaseDate: '01/01/9999' }
    const past = { releaseDate: '01/01/2000' }
    const locked = { index: 1, title: 'a', sourceUrl: null, previewable: false }
    const open = { index: 2, title: 'b', sourceUrl: null, previewable: true }
    const unspecified = { index: 3, title: 'c', sourceUrl: null }
    expect(isTrackLocked(future, locked)).toBe(true)
    expect(isTrackLocked(future, open)).toBe(false)
    expect(isTrackLocked(future, unspecified)).toBe(false)
    expect(isTrackLocked(past, locked)).toBe(false)
  })
})
