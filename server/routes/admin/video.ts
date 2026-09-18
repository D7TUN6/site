import crypto from 'node:crypto'
import { requestBodyStream } from '../../lib/http-body.js'
import { mkdir, readdir, readFile, writeFile, rm, access } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import path from 'node:path'
import busboy from 'busboy'
import { Elysia } from 'elysia'
import { enforceSameOrigin } from '../../lib/request-origin.js'
import { requireAdmin } from '../../middleware/require-auth.js'
import { ROOT, slugify } from './shared.js'
import { convertVideoToHls, generateVideoThumbnails, spawnRebuild } from '../../lib/media-convert.js'
import { getOrder, setOrder, applyOrder } from './order-utils.js'

const VIDEO_ROOT = path.join(ROOT, 'public', 'media', 'video')
const VIDEO_EXT = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'])

// The master file is kept on disk and recorded as a non-HLS source so the
// entry page gets its "download" button; the MIME just needs to be truthful
// enough for the frontend's source classifier (non-HLS → downloadable).
function masterSourceUrl(filename: string, slug: string): { url: string; type: string } {
  const ext = path.extname(filename).toLowerCase()
  const type = ext === '.webm' ? 'video/webm'
    : ext === '.mov' ? 'video/quicktime'
    : ext === '.mkv' ? 'video/x-matroska'
    : ext === '.avi' ? 'video/x-msvideo'
    : 'video/mp4'
  return { url: `/media/video/${slug}/videos/${filename}`, type }
}

async function writeMdx(slug: string, data: { title: string; date: string; thumbnail: string; description?: string; sources: Array<{ url: string; type: string; resolution?: string }> }) {
  const dir = path.join(VIDEO_ROOT, slug)
  await mkdir(dir, { recursive: true })
  const sourcesStr = data.sources.map((s) => `  - url: ${s.url}\n    type: ${s.type}`).join('\n')
  const escapedDesc = (data.description || '').replace(/"/g, '\\"').replace(/\n/g, '\\n')
  const mdx = `---
title: "${data.title.replace(/"/g, '\\"')}"
date: "${data.date}"
thumbnail: "${data.thumbnail}"
description: "${escapedDesc}"
sources:
${sourcesStr}
---
`
  await writeFile(path.join(dir, 'index.mdx'), mdx, 'utf-8')
}

function parseSourcesSection(raw: string): Array<{ url: string; type: string; resolution?: string }> {
  const sourcesSection = raw.match(/^sources:\n((?:\s+- .+\n?)*)/m)
  if (!sourcesSection) return []
  return sourcesSection[1].trim().split('\n').map((line) => {
    const item: Record<string, string> = {}
    const parts = line.replace(/^\s*-\s*/, '').split(',').map((s) => s.trim())
    for (const part of parts) {
      const [k, ...v] = part.split(':')
      if (k && v.length) item[k.trim()] = v.join(':').trim()
    }
    return item as { url: string; type: string; resolution?: string }
  })
}

export function createAdminVideoRouter() {
  return new Elysia({ prefix: '/api/admin/video' })
    .get('/', async ({ set }) => {
      try {
        const dirents = await readdir(VIDEO_ROOT, { withFileTypes: true }).catch(() => [])
        const entries: unknown[] = []
        for (const d of dirents) {
          if (!d.isDirectory()) continue
          const dir = path.join(VIDEO_ROOT, d.name)
          const mdxMeta = { title: d.name, date: '', thumbnail: '', description: '', sources: [] as Array<{ url: string; type: string; resolution?: string }> }
          try {
            const raw = await readFile(path.join(dir, 'index.mdx'), 'utf-8')
            const titleM = raw.match(/^title:\s*"([^"]*)"/m)
            const dateM = raw.match(/^date:\s*"([^"]*)"/m)
            const thumbM = raw.match(/^thumbnail:\s*"([^"]*)"/m)
            const descM = raw.match(/^description:\s*"([^"]*)"/m)
            if (titleM) mdxMeta.title = titleM[1]
            if (dateM) mdxMeta.date = dateM[1]
            if (thumbM) mdxMeta.thumbnail = thumbM[1]
            if (descM) mdxMeta.description = descM[1].replace(/\\n/g, '\n')
            mdxMeta.sources = parseSourcesSection(raw)
          } catch { /* ok */ }
          entries.push({ slug: d.name, ...mdxMeta })
        }
        entries.sort((a: unknown, b: unknown) => String((b as Record<string, string>).date).localeCompare(String((a as Record<string, string>).date)))
        const videoOrder = await getOrder(VIDEO_ROOT)
        return { ok: true, entries: applyOrder(entries as Array<{ slug: string }>, VIDEO_ROOT, videoOrder) as typeof entries }
      } catch (err) {
        console.error('admin video list failed', err)
        set.status = 500
        return { error: 'Unable to list video entries' }
      }
    }, { beforeHandle: requireAdmin })
    .post('/', async ({ body, set }) => {
      const b = (body || {}) as Record<string, unknown>
      const title = typeof b.title === 'string' ? b.title.trim() : ''
      if (!title) {
        set.status = 400
        return { error: 'title is required' }
      }
      const slug = slugify(title)
      if (!slug) {
        set.status = 400
        return { error: 'Invalid title' }
      }
      const dir = path.join(VIDEO_ROOT, slug)
      try { await access(dir); set.status = 409; return { error: 'Entry with this slug already exists' } } catch { /* ok */ }

      const date = typeof b.date === 'string' ? b.date.trim() : new Date().toISOString().split('T')[0]
      const description = typeof b.description === 'string' ? b.description.trim() : ''

      try {
        await mkdir(dir, { recursive: true })
        await writeMdx(slug, { title, date, description, thumbnail: '', sources: [] })

        spawnRebuild()
        return { ok: true, slug }
      } catch (err) {
        console.error('admin video create failed', err)
        set.status = 500
        return { error: 'Unable to create video entry' }
      }
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
    .post('/:slug/upload', ({ request, params, set }) => {
      return (async () => {
        const slug = String(params.slug).replace(/[^a-z0-9-]/g, '')
        if (!slug) {
          set.status = 400
          return { error: 'Invalid slug' }
        }
        const entryDir = path.join(VIDEO_ROOT, slug)
        try { await access(entryDir) } catch {
          set.status = 404
          return { error: 'Entry not found' }
        }

        const contentType = request.headers.get('content-type') || ''
        if (!contentType.includes('multipart/form-data')) {
          set.status = 400
          return { error: 'Expected multipart/form-data' }
        }

        const videoDir = path.join(entryDir, 'videos')
        await mkdir(videoDir, { recursive: true })

        let savedFile = ''
        try {
          await new Promise<void>((resolve, reject) => {
            const bb = busboy({ headers: Object.fromEntries(request.headers.entries()), limits: { fileSize: 10 * 1024 * 1024 * 1024, files: 1 } })
            bb.on('file', (_field: string, stream: NodeJS.ReadableStream, info: { filename: string }) => {
              const ext = path.extname(info.filename).toLowerCase()
              if (!VIDEO_EXT.has(ext)) { stream.resume(); return }
              const filename = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}${ext}`
              const dest = path.join(videoDir, filename)
              savedFile = filename
              const ws = createWriteStream(dest)
              stream.pipe(ws)
              new Promise<void>((r, j) => { ws.on('finish', r); ws.on('error', j); stream.on('error', j) })
            })
            bb.on('error', reject)
            bb.on('finish', resolve)
            requestBodyStream(request.body).pipe(bb)
          })

          if (!savedFile) {
            set.status = 400
            return { error: 'No valid video file received' }
          }

          const srcPath = path.join(videoDir, savedFile)
          const { playlist, thumbnail, master } = await convertVideoToHls(srcPath, videoDir, savedFile)

          const mdx = { title: slug, date: '', thumbnail: '', description: '', sources: [] as Array<{ url: string; type: string; resolution?: string }> }
          try {
            const raw = await readFile(path.join(entryDir, 'index.mdx'), 'utf-8')
            const titleM = raw.match(/^title:\s*"([^"]*)"/m)
            const dateM = raw.match(/^date:\s*"([^"]*)"/m)
            const descM = raw.match(/^description:\s*"([^"]*)"/m)
            if (titleM) mdx.title = titleM[1]
            if (dateM) mdx.date = dateM[1]
            if (descM) mdx.description = descM[1]
          } catch { /* ok */ }

          const fullThumbnail = `/media/video/${slug}/videos/${thumbnail}`
          mdx.thumbnail = fullThumbnail
          mdx.sources = [
            { url: `/media/video/${slug}/videos/${playlist}`, type: 'application/vnd.apple.mpegurl', resolution: '720p' },
            masterSourceUrl(master, slug),
          ]

          await writeMdx(slug, mdx)

          spawnRebuild()
          return { ok: true, slug, thumbnail: fullThumbnail, playlist }
        } catch (err) {
          console.error('admin video upload failed', err)
          set.status = 500
          return { error: 'Unable to upload video' }
        }
      })()
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
    .patch('/:slug', async ({ params, body, set }) => {
      const slug = String(params.slug).replace(/[^a-z0-9-]/g, '')
      if (!slug) {
        set.status = 400
        return { error: 'Invalid slug' }
      }
      const entryDir = path.join(VIDEO_ROOT, slug)
      try { await access(entryDir) } catch {
        set.status = 404
        return { error: 'Entry not found' }
      }

      const mdx = { title: slug, date: '', thumbnail: '', description: '', sources: [] as Array<{ url: string; type: string; resolution?: string }> }
      try {
        const raw = await readFile(path.join(entryDir, 'index.mdx'), 'utf-8')
        const titleM = raw.match(/^title:\s*"([^"]*)"/m)
        const dateM = raw.match(/^date:\s*"([^"]*)"/m)
        const thumbM = raw.match(/^thumbnail:\s*"([^"]*)"/m)
        const descM = raw.match(/^description:\s*"([^"]*)"/m)
        if (titleM) mdx.title = titleM[1]
        if (dateM) mdx.date = dateM[1]
        if (thumbM) mdx.thumbnail = thumbM[1].startsWith('/') ? thumbM[1] : `/media/video/${slug}/videos/${thumbM[1]}`
        if (descM) mdx.description = descM[1]
      } catch { /* ok */ }

      const b = (body || {}) as Record<string, unknown>
      if (typeof b.title === 'string') mdx.title = b.title.trim()
      if (typeof b.date === 'string') mdx.date = b.date.trim()
      if (typeof b.description === 'string') mdx.description = b.description.trim()

      try {
        await writeMdx(slug, mdx)

        spawnRebuild()
        return { ok: true }
      } catch (err) {
        console.error('admin video patch failed', err)
        set.status = 500
        return { error: 'Unable to update entry' }
      }
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
    .delete('/:slug', async ({ params, set }) => {
      const slug = String(params.slug).replace(/[^a-z0-9-]/g, '')
      if (!slug) {
        set.status = 400
        return { error: 'Invalid slug' }
      }
      const entryDir = path.join(VIDEO_ROOT, slug)
      try { await access(entryDir) } catch {
        set.status = 404
        return { error: 'Entry not found' }
      }
      try {
        await rm(entryDir, { recursive: true, force: true })

        spawnRebuild()
        return { ok: true }
      } catch (err) {
        console.error('admin video delete failed', err)
        set.status = 500
        return { error: 'Unable to delete entry' }
      }
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
    .post('/reorder', async ({ body, set }) => {
      try {
        const b = (body || {}) as Record<string, unknown>
        const order = Array.isArray(b.order) ? b.order as string[] : []
        if (order.length === 0) {
          set.status = 400
          return { error: 'Order array required' }
        }
        await setOrder(VIDEO_ROOT, order)
        return { ok: true }
      } catch (err) {
        console.error('admin video reorder failed', err)
        set.status = 500
        return { error: 'Unable to reorder' }
      }
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
    .post('/:slug/generate-thumbnails', async ({ params, set }) => {
      const slug = String(params.slug).replace(/[^a-z0-9-]/g, '')
      if (!slug) {
        set.status = 400
        return { error: 'Invalid slug' }
      }
      const entryDir = path.join(VIDEO_ROOT, slug)
      const videoDir = path.join(entryDir, 'videos')
      try { await access(videoDir) } catch {
        set.status = 404
        return { error: 'No video files found' }
      }

      try {
        const dirents = await readdir(videoDir)
        const videoFile = dirents.find((f) => VIDEO_EXT.has(path.extname(f).toLowerCase()) || f.endsWith('.ts'))
        if (!videoFile) {
          set.status = 404
          return { error: 'No source video found' }
        }

        const thumbs = await generateVideoThumbnails(path.join(videoDir, videoFile), videoDir)
        const publicThumbs = thumbs.map((t) => `/media/video/${slug}/videos/${t}`)
        return { ok: true, thumbnails: publicThumbs }
      } catch (err) {
        console.error('thumbnail generation failed', err)
        set.status = 500
        return { error: 'Unable to generate thumbnails' }
      }
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
    .post('/:slug/thumbnail', ({ request, params, body, set }) => {
      return (async () => {
        const slug = String(params.slug).replace(/[^a-z0-9-]/g, '')
        if (!slug) {
          set.status = 400
          return { error: 'Invalid slug' }
        }
        const entryDir = path.join(VIDEO_ROOT, slug)
        try { await access(entryDir) } catch {
          set.status = 404
          return { error: 'Entry not found' }
        }

        let thumbnail = ''

        const contentType = request.headers.get('content-type') || ''
        if (contentType.includes('multipart/form-data')) {
          const videoDir = path.join(entryDir, 'videos')
          await mkdir(videoDir, { recursive: true })
          try {
            await new Promise<void>((resolve, reject) => {
              const bb = busboy({ headers: Object.fromEntries(request.headers.entries()), limits: { fileSize: 10 * 1024 * 1024, files: 1 } })
              bb.on('file', (_field: string, stream: NodeJS.ReadableStream, info: { filename: string }) => {
                const ext = path.extname(info.filename).toLowerCase()
                if (!['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) { stream.resume(); return }
                const filename = `thumb-${Date.now()}-${crypto.randomUUID().slice(0, 8)}${ext}`
                const dest = path.join(videoDir, filename)
                thumbnail = `/media/video/${slug}/videos/${filename}`
                const ws = createWriteStream(dest)
                stream.pipe(ws)
                new Promise<void>((r, j) => { ws.on('finish', r); ws.on('error', j); stream.on('error', j) })
              })
              bb.on('error', reject)
              bb.on('finish', resolve)
              requestBodyStream(request.body).pipe(bb)
            })
          } catch {
            set.status = 500
            return { error: 'Unable to upload thumbnail' }
          }
        } else {
          const b = (body || {}) as Record<string, unknown>
          thumbnail = typeof b.thumbnail === 'string' ? b.thumbnail.trim() : ''
        }

        if (!thumbnail) {
          set.status = 400
          return { error: 'thumbnail is required' }
        }

        const mdx = { title: slug, date: '', thumbnail: '', description: '', sources: [] as Array<{ url: string; type: string; resolution?: string }> }
        try {
          const raw = await readFile(path.join(entryDir, 'index.mdx'), 'utf-8')
          const titleM = raw.match(/^title:\s*"([^"]*)"/m)
          const dateM = raw.match(/^date:\s*"([^"]*)"/m)
          const descM = raw.match(/^description:\s*"([^"]*)"/m)
          if (titleM) mdx.title = titleM[1]
          if (dateM) mdx.date = dateM[1]
          if (descM) mdx.description = descM[1].replace(/\\n/g, '\n')
          mdx.sources = parseSourcesSection(raw)
        } catch { /* ok */ }

        mdx.thumbnail = thumbnail.startsWith('/') ? thumbnail : `/media/video/${slug}/videos/${thumbnail}`

        try {
          await writeMdx(slug, mdx)

          spawnRebuild()
          return { ok: true, thumbnail: mdx.thumbnail }
        } catch (err) {
          console.error('thumbnail update failed', err)
          set.status = 500
          return { error: 'Unable to update thumbnail' }
        }
      })()
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
}
