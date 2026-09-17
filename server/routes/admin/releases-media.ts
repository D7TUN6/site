import { createWriteStream } from 'node:fs'
import { requestBodyStream } from '../../lib/http-body.js'
import { mkdir, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import busboy from 'busboy'
import { Elysia } from 'elysia'
import { enforceSameOrigin } from '../../lib/request-origin.js'
import { requireAdmin } from '../../middleware/require-auth.js'
import { processCoverImage, spawnRebuild } from '../../lib/media-convert.js'
import type { ReleaseDownloadService } from '../../lib/release-download-service.js'
import { getAlbumDir, COVER_EXTS, writeReleaseMdx } from './releases-validation.js'

const MUSIC_ROOT = path.resolve(process.env.MUSIC_ROOT || path.join(process.cwd(), 'public', 'media', 'music'))

export function createReleasesMediaRouter({ releaseService }: { releaseService: ReleaseDownloadService }) {
  return new Elysia()
    .post('/:slug/cover', ({ request, params, set }) => {
      return (async () => {
        const slug = typeof params.slug === 'string' ? params.slug.trim() : ''
        if (slug.includes('..') || slug.includes('/') || slug.includes('\\')) {
          set.status = 400
          return { error: 'Invalid slug' }
        }
        const album = await getAlbumDir(slug)
        if (!album) {
          set.status = 404
          return { error: 'Release not found' }
        }

        const resolved = path.resolve(album.dir)
        if (!resolved.startsWith(MUSIC_ROOT)) {
          set.status = 400
          return { error: 'Invalid path' }
        }

        const contentType = request.headers.get('content-type') || ''
        if (!contentType.includes('multipart/form-data')) {
          set.status = 400
          return { error: 'Expected multipart/form-data' }
        }

        const coverDir = path.join(album.dir, 'cover')
        await mkdir(coverDir, { recursive: true })

        let savedFile = ''
        try {
          await new Promise<void>((resolve, reject) => {
            const bb = busboy({ headers: Object.fromEntries(request.headers.entries()), limits: { files: 1 } })
            const pending: Promise<void>[] = []
            bb.on('file', (_field: string, stream: NodeJS.ReadableStream, info: { filename: string }) => {
              const ext = path.extname(info.filename).toLowerCase()
              if (!COVER_EXTS.has(ext)) { stream.resume(); return }
              const filename = `cover${ext}`
              const dest = path.join(coverDir, filename)
              savedFile = filename
              const ws = createWriteStream(dest)
              stream.pipe(ws)
              pending.push(new Promise<void>((res2, rej) => {
                ws.on('finish', res2)
                ws.on('error', rej)
                stream.on('error', rej)
              }))
            })
            bb.on('error', reject)
            bb.on('finish', () => Promise.all(pending).then(() => resolve()).catch(reject))
            requestBodyStream(request.body).pipe(bb)
          })

          if (!savedFile) {
            set.status = 400
            return { error: 'No valid image file received' }
          }

          const srcPath = path.join(coverDir, savedFile)
          const { webp, preview } = await processCoverImage(srcPath, coverDir)

          // remove old cover files
          const coverFiles = await readdir(coverDir).catch(() => [])
          for (const f of coverFiles) {
            if (f !== webp && f !== preview && !f.startsWith('cover')) continue
            if (f === webp || f === preview) continue
            await rm(path.join(coverDir, f), { force: true }).catch(() => {})
          }

          releaseService.invalidateCache(slug)
          spawnRebuild()
          writeReleaseMdx(slug, album.dir).catch((e) => console.error('writeReleaseMdx failed', e))
          return { ok: true, coverUrl: `/media/music/${album.name}/cover/${webp}`, coverPreviewUrl: `/media/music/${album.name}/cover/${preview}` }
        } catch (err) {
          console.error('admin release cover upload failed', err)
          set.status = 500
          return { error: 'Unable to upload cover' }
        }
      })()
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
    .delete('/:slug/cover', async ({ params, set }) => {
      const slug = typeof params.slug === 'string' ? params.slug.trim() : ''
      if (slug.includes('..') || slug.includes('/') || slug.includes('\\')) {
        set.status = 400
        return { error: 'Invalid slug' }
      }
      const album = await getAlbumDir(slug)
      if (!album) {
        set.status = 404
        return { error: 'Release not found' }
      }

      const resolved = path.resolve(album.dir)
      if (!resolved.startsWith(MUSIC_ROOT)) {
        set.status = 400
        return { error: 'Invalid path' }
      }

      const coverDir = path.join(album.dir, 'cover')
      try {
        const files = await readdir(coverDir).catch(() => [])
        for (const f of files) {
          await rm(path.join(coverDir, f), { force: true }).catch(() => {})
        }
        releaseService.invalidateCache(slug)
        spawnRebuild()
        writeReleaseMdx(slug, album.dir).catch((e) => console.error('writeReleaseMdx failed', e))
        return { ok: true }
      } catch (err) {
        console.error('admin release cover delete failed', err)
        set.status = 500
        return { error: 'Unable to delete cover' }
      }
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
}
