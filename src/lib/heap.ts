import type { BlogPostEntry } from '@/types/content'

export const HEAP_BLOCKS = 45
export const HEAP_COLS = 5

function djb2(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0
  return hash
}

function utf8len(str: string): number {
  try {
    return new TextEncoder().encode(str).length
  } catch {
    return str.length
  }
}

export function getByteSize(str: string): string {
  const n = utf8len(str)
  return n < 1000 ? `${n}b` : `${(n / 1000).toFixed(1)}kb`
}

export function getHexAddr(slug: string): string {
  return `0x${(djb2(slug) & 0xfffff).toString(16).toUpperCase().padStart(5, '0')}`
}

export function sectorLabel(n: number): string {
  return `sector_0x${n.toString(16).padStart(2, '0').toUpperCase()}`
}

export function getHeapBlock(post: Pick<BlogPostEntry, 'slug' | 'title' | 'publishedAt' | 'excerpt'>): {
  bytes: number
  size: string
  height: number
} {
  const body = `${post.title}\u200b${post.publishedAt}\u200b${post.excerpt}\u200b${post.slug}`
  const bytes = utf8len(body)
  return {
    bytes,
    size: getByteSize(body),
    height: 84 + Math.min(74, Math.floor(bytes / 46)),
  }
}