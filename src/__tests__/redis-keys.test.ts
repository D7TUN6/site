import { describe, it, expect } from 'bun:test'

// key pattern tests for redis module (pure functions)
// mirrors the k object from src/lib/redis.ts

const k = {
  manifest: () => 'v1:manifest',
  release: (slug: string) => `v1:release:${slug}`,
  galleryEntry: (slug: string) => `v1:gallery:${slug}`,
  galleryIndex: () => 'v1:gallery:index',
  videoEntry: (slug: string) => `v1:video:${slug}`,
  videoIndex: () => 'v1:video:index',
  shopProduct: (slug: string) => `v1:shop:${slug}`,
  shopIndex: () => 'v1:shop:index',
  banner: (page: string) => `v1:banner:${page}`,
  siteConfig: () => 'v1:site:config',
  radioCatalog: () => 'v1:radio:catalog',
  adminSession: (token: string) => `v1:admin:session:${token}`,
  userSession: (token: string) => `v1:user:session:${token}`,
  order: (id: string) => `v1:order:${id}`,
  orderIndex: () => 'v1:order:index',
  job: (id: string) => `v1:job:${id}`,
  queue: (name: string) => `v1:queue:${name}`,
  cacheVersion: (slug: string) => `v1:cache:version:${slug}`,
  downloadJob: (id: string) => `v1:download:job:${id}`,
  publicUrl: (slug: string, trackIdx: number, fmt: string) => `v1:url:${slug}:${trackIdx}:${fmt}`,
}

describe('redis key patterns', () => {
  it('manifest key is stable', () => {
    expect(k.manifest()).toBe('v1:manifest')
  })

  it('release key includes slug', () => {
    expect(k.release('my-album')).toBe('v1:release:my-album')
  })

  it('galleryIndex key is stable', () => {
    expect(k.galleryIndex()).toBe('v1:gallery:index')
  })

  it('galleryEntry key includes slug', () => {
    expect(k.galleryEntry('concert-2025')).toBe('v1:gallery:concert-2025')
  })

  it('videoIndex key is stable', () => {
    expect(k.videoIndex()).toBe('v1:video:index')
  })

  it('videoEntry key includes slug', () => {
    expect(k.videoEntry('my-video')).toBe('v1:video:my-video')
  })

  it('shopIndex key is stable', () => {
    expect(k.shopIndex()).toBe('v1:shop:index')
  })

  it('shopProduct key includes slug', () => {
    expect(k.shopProduct('t-shirt')).toBe('v1:shop:t-shirt')
  })

  it('banner key includes page', () => {
    expect(k.banner('index')).toBe('v1:banner:index')
  })

  it('siteConfig key is stable', () => {
    expect(k.siteConfig()).toBe('v1:site:config')
  })

  it('radioCatalog key is stable', () => {
    expect(k.radioCatalog()).toBe('v1:radio:catalog')
  })

  it('adminSession key includes token', () => {
    expect(k.adminSession('tok123')).toBe('v1:admin:session:tok123')
  })

  it('queue key includes name', () => {
    expect(k.queue('audio-hls')).toBe('v1:queue:audio-hls')
  })

  it('cacheVersion key includes slug', () => {
    expect(k.cacheVersion('releases')).toBe('v1:cache:version:releases')
  })

  it('publicUrl key includes slug, trackIdx, format', () => {
    expect(k.publicUrl('album', 1, 'mp3')).toBe('v1:url:album:1:mp3')
  })

  it('downloadJob key includes id', () => {
    expect(k.downloadJob('job-abc')).toBe('v1:download:job:job-abc')
  })

  it('order key includes id', () => {
    expect(k.order('ord-456')).toBe('v1:order:ord-456')
  })

  it('orderIndex key is stable', () => {
    expect(k.orderIndex()).toBe('v1:order:index')
  })

  it('job key includes id', () => {
    expect(k.job('job-xyz')).toBe('v1:job:job-xyz')
  })

  it('all keys have v1: prefix', () => {
    const keys = [
      k.manifest(), k.release('a'), k.galleryIndex(), k.galleryEntry('a'),
      k.videoIndex(), k.videoEntry('a'), k.shopIndex(), k.shopProduct('a'),
      k.banner('a'), k.siteConfig(), k.radioCatalog(),
      k.adminSession('a'), k.userSession('a'), k.order('a'), k.orderIndex(),
      k.job('a'), k.queue('a'), k.cacheVersion('a'), k.downloadJob('a'),
      k.publicUrl('a', 1, 'mp3'),
    ]
    for (const key of keys) {
      expect(key.startsWith('v1:')).toBe(true)
    }
  })
})
