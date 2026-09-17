import crypto from 'node:crypto'
import { requestBodyStream } from '../lib/http-body.js'
import { mkdir, rm } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import path from 'node:path'
import busboy from 'busboy'
import { Elysia } from 'elysia'
import type { DatabaseSync } from '../lib/sqlite.js'
import { requireUser } from '../middleware/require-auth.js'
import { createSessionPlugin } from '../middleware/session.js'
import { ROOT } from './admin/shared.js'
import { runFfmpeg } from '../lib/media-convert.js'

const TMP_DIR = path.join(ROOT, 'tmp', 'moderation')
mkdir(TMP_DIR, { recursive: true }).catch(() => {})

const contentTypes: Record<string, string> = {
  release: 'release',
  video: 'media_video',
  photo: 'media_photo',
  merch: 'shop_product',
}

async function toWav(src: string): Promise<string | null> {
  const ext = path.extname(src).toLowerCase()
  if (ext === '.wav') return src
  const dest = src.slice(0, -ext.length) + '.wav'
  try {
    await runFfmpeg(['-y', '-i', src, '-c:a', 'pcm_s16le', '-f', 'wav', dest])
    await rm(src, { force: true })
    return dest
  } catch (err) {
    console.error('toWav conversion failed for', src, err)
    return null
  }
}

export function createModerationRouter({ db }: { db: DatabaseSync }) {
  return new Elysia({ prefix: '/api/moderation' })
    .use(createSessionPlugin({ db }))

    .post('/submit-content', ({ request, body, set, user }) => {
      const filePaths: Record<string, { filename: string; path: string }[]> = {}
      return (async () => {
        try {
          const ct = request.headers.get('content-type') || ''

          // ── JSON path (requests without files) ──
          if (ct.includes('application/json')) {
            const jsonBody = (body || {}) as Record<string, unknown>
            const rawType = typeof jsonBody.type === 'string' ? jsonBody.type.trim().toLowerCase() : ''
            const dbType = contentTypes[rawType]
            if (!dbType) {
              set.status = 400
              return { error: 'invalid content type' }
            }
            const jsonData = jsonBody.data

            const artist = db.prepare(
              "select id from artists where user_id = ? and status = 'approved'"
            ).get(user!.id) as { id: number } | undefined

            if (!artist) {
              set.status = 403
              return { error: 'only approved artists can submit content' }
            }
            if (!jsonData || typeof jsonData !== 'object') {
              set.status = 400
              return { error: 'data is required' }
            }

            const payload = JSON.stringify({ ...jsonData, artistId: artist.id })
            db.prepare(
              "insert into submissions (user_id, artist_id, type, status, data, feedback, created_at) values (?, ?, ?, 'pending', ?, '', ?)"
            ).run(user!.id, artist.id, dbType, payload)

            set.status = 201
            return { ok: true }
          }

          // ── multipart path (with files) ──
          let type = ''
          const textFields: Record<string, string> = {}

          await new Promise<void>((resolve, reject) => {
            const bb = busboy({ headers: Object.fromEntries(request.headers.entries()), limits: { fileSize: 1024 * 1024 * 1024 } })
            const pending: Promise<void>[] = []

            bb.on('field', (name: string, val: string) => {
              if (name === 'type') type = val.trim().toLowerCase()
              else textFields[name] = val
            })

            bb.on('file', (field: string, stream: NodeJS.ReadableStream, info: { filename: string }) => {
              if (!info.filename) { stream.resume(); return }
              const ext = path.extname(info.filename) || ''
              const tmpPath = path.join(TMP_DIR, `${field}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}${ext}`)
              const ws = createWriteStream(tmpPath)
              stream.pipe(ws)
              pending.push(new Promise<void>((r, j) => {
                ws.on('finish', () => {
                  if (!filePaths[field]) filePaths[field] = []
                  filePaths[field].push({ filename: info.filename, path: tmpPath })
                  r()
                })
                ws.on('error', j)
                stream.on('error', j)
              }))
            })

            bb.on('error', reject)
            bb.on('finish', () => Promise.all(pending).then(() => resolve()).catch(reject))
            requestBodyStream(request.body).pipe(bb)
          })

          const dbType = contentTypes[type]
          if (!dbType) {
            set.status = 400
            return { error: 'invalid content type' }
          }

          const artist = db.prepare(
            "select id from artists where user_id = ? and status = 'approved'"
          ).get(user!.id) as { id: number } | undefined

          if (!artist) {
            set.status = 403
            return { error: 'only approved artists can submit content' }
          }

          // Convert uploaded tracks to WAV
          if (type === 'release' && filePaths['tracks']) {
            for (const t of filePaths['tracks']) {
              const wav = await toWav(t.path)
              if (wav) {
                t.path = wav
                t.filename = path.basename(wav)
              }
            }
          }

          const payload = JSON.stringify({
            ...textFields,
            _files: filePaths,
            artistId: artist.id,
          })

          db.prepare(
            "insert into submissions (user_id, artist_id, type, status, data, feedback, created_at) values (?, ?, ?, 'pending', ?, '', ?)"
          ).run(user!.id, artist.id, dbType, payload)

          set.status = 201
          return { ok: true }
        } catch (err) {
          for (const files of Object.values(filePaths)) {
            for (const f of files) {
              await rm(f.path, { force: true }).catch(() => {})
            }
          }
          console.error('moderation submit content failed', err)
          set.status = 500
          return { error: 'failed to submit content' }
        }
      })()
    }, { beforeHandle: requireUser })
}
