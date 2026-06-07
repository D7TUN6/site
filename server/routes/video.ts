import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import express from 'express'
import type { VideoEntry } from '../../src/types/content.js'

const ROOT = process.cwd()
const VIDEO_DIR = path.join(ROOT, 'public', 'media', 'video')

let cached: VideoEntry[] | null = null
let cachePromise: Promise<VideoEntry[]> | null = null

function parseFrontmatter(raw: string): Record<string, unknown> {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/)
  if (!match) return {}
  const body = match[1]
  const attrs: Record<string, unknown> = {}
  for (const line of body.split('\n')) {
    const sep = line.indexOf(':')
    if (sep === -1) continue
    const key = line.slice(0, sep).trim()
    const rawVal = line.slice(sep + 1).trim()
    let val: unknown = rawVal.replace(/^["']|["']$/g, '')
    if (rawVal === 'true') val = true
    else if (rawVal === 'false') val = false
    else if (/^\d+$/.test(rawVal)) val = Number(rawVal)
    attrs[key] = val
  }
  const sourcesMatch = raw.match(/^sources:\n((?:\s+- .+\n)*)/m)
  if (sourcesMatch) {
    const sourcesLines = sourcesMatch[1].trim().split('\n')
    const sources: Array<Record<string, string>> = sourcesLines.map((line: string) => {
      const item: Record<string, string> = {}
      const parts = line.replace(/^\s*-\s*/, '').split(',').map((s: string) => s.trim())
      for (const part of parts) {
        const [k, ...v] = part.split(':')
        if (k && v.length) item[k.trim()] = v.join(':').trim()
      }
      return item
    })
    attrs.sources = sources as unknown[]
  }
  return attrs
}

async function loadAllEntries(): Promise<VideoEntry[]> {
  let dirs: import('node:fs').Dirent[]
  try {
    dirs = await readdir(VIDEO_DIR, { withFileTypes: true })
  } catch {
    return []
  }
  const entries: VideoEntry[] = []
  for (const dirent of dirs) {
    if (!dirent.isDirectory()) continue
    const slug = dirent.name
    const mdxPath = path.join(VIDEO_DIR, slug, 'index.mdx')
    try {
      const raw = await readFile(mdxPath, 'utf-8')
      const attrs = parseFrontmatter(raw)
      entries.push({
        slug,
        title: String(attrs.title ?? slug),
        date: String(attrs.date ?? ''),
        duration: typeof attrs.duration === 'number' ? attrs.duration : null,
        thumbnail: String(attrs.thumbnail ?? ''),
        sources: Array.isArray(attrs.sources) ? (attrs.sources as Array<{ url: string; type: string; resolution?: string }>) : [],
      })
    } catch {
      continue
    }
  }
  entries.sort((a, b) => b.date.localeCompare(a.date))
  return entries
}

function getVideoEntries(): Promise<VideoEntry[]> {
  if (cached) return Promise.resolve(cached)
  if (cachePromise) return cachePromise
  cachePromise = loadAllEntries().then((e) => { cached = e; return e })
  return cachePromise
}

export function createVideoRouter() {
  const router = express.Router()

  router.get('/entries', async (_req, res) => {
    try {
      const entries = await getVideoEntries()
      res.json({ ok: true, entries })
    } catch (err) {
      console.error('video entries failed', err)
      res.status(500).json({ error: 'Unable to load video entries' })
    }
  })

  router.get('/entries/:slug', async (req, res) => {
    try {
      const entries = await getVideoEntries()
      const entry = entries.find((e) => e.slug === req.params.slug)
      if (!entry) return res.status(404).json({ error: 'Not found' })
      res.json({ ok: true, entry })
    } catch (err) {
      console.error('video entry failed', err)
      res.status(500).json({ error: 'Unable to load entry' })
    }
  })

  router.post('/invalidate', (_req, res) => {
    cached = null
    cachePromise = null
    res.json({ ok: true })
  })

  return router
}
