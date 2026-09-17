import { readdir, stat, readFile, writeFile, unlink, mkdir, rm } from 'node:fs/promises'
import { requestBodyStream } from '../lib/http-body.js'
import { createWriteStream } from 'node:fs'
import path from 'node:path'
import Busboy from 'busboy'
import { Elysia } from 'elysia'
import { requireAdmin } from '../middleware/require-auth.js'

const ROOT = process.cwd()
const STORAGE_DIR = path.join(ROOT, 'storage')

async function listDir(dirPath: string, relativeRoot: string): Promise<Array<{ name: string; path: string; size: number; mtime: string; isDir: boolean }>> {
  const entries = await readdir(dirPath, { withFileTypes: true })
  const result: Array<{ name: string; path: string; size: number; mtime: string; isDir: boolean }> = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const fullPath = path.join(dirPath, entry.name)
    const relPath = path.relative(relativeRoot, fullPath)
    const s = await stat(fullPath)
    result.push({
      name: entry.name,
      path: relPath,
      size: s.size,
      mtime: s.mtime.toISOString(),
      isDir: entry.isDirectory(),
    })
  }
  result.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return result
}

async function ensureDir(dir: string) {
  try { await mkdir(dir, { recursive: true }) } catch { /* ok */ }
}

export function createStorageRouter() {
  return new Elysia({ prefix: '/api/storage' })
    .get('/list', async ({ query, set }) => {
      try {
        const sub = typeof query.path === 'string' ? query.path : ''
        const target = path.join(STORAGE_DIR, sub)
        const safeDir = STORAGE_DIR + path.sep
        if (!target.startsWith(safeDir) && target !== STORAGE_DIR) {
          set.status = 403
          return { error: 'Forbidden' }
        }
        const entries = await listDir(target, STORAGE_DIR)
        return { ok: true, entries }
      } catch (err) {
        console.error('storage list failed', err)
        set.status = 500
        return { error: 'Unable to list storage' }
      }
    }, { beforeHandle: requireAdmin })

    .post('/upload', ({ request, query, set }) => {
      const contentLength = parseInt(request.headers.get('content-length') || '0', 10)
      if (contentLength > 100 * 1024 * 1024) {
        set.status = 413
        return { error: 'File too large' }
      }
      const sub = typeof query.path === 'string' ? query.path : ''
      const targetDir = path.join(STORAGE_DIR, sub)
      const safeDir = STORAGE_DIR + path.sep
      if (!targetDir.startsWith(safeDir) && targetDir !== STORAGE_DIR) {
        set.status = 403
        return { error: 'Forbidden' }
      }

      return new Promise((resolve) => {
        const busboy = Busboy({ headers: Object.fromEntries(request.headers.entries()), limits: { fileSize: 1024 * 1024 * 1024 } })
        const uploaded: string[] = []
        let hasError = false

        busboy.on('file', async (fieldname, file, info) => {
          const filename = info.filename
          const destPath = path.join(targetDir, filename)
          if (!destPath.startsWith(STORAGE_DIR)) {
            file.resume()
            return
          }
          try {
            await ensureDir(path.dirname(destPath))
          } catch { /* ok */ }
          const ws = createWriteStream(destPath)
          file.pipe(ws)
          await new Promise<void>((resolve, reject) => {
            ws.on('finish', () => { uploaded.push(path.join(sub, filename)); resolve() })
            ws.on('error', reject)
            file.on('error', reject)
          })
        })

        busboy.on('error', (err) => {
          hasError = true
          console.error('storage upload error', err)
          resolve({ error: 'Upload failed' })
        })

        busboy.on('finish', () => {
          if (hasError) return
          resolve({ ok: true, files: uploaded })
        })

        requestBodyStream(request.body).pipe(busboy)
      }) as Promise<{ ok?: boolean; files?: string[]; error?: string }>
    }, { beforeHandle: requireAdmin })

    .post('/mkdir', async ({ body, set }) => {
      try {
        const b = (body || {}) as Record<string, unknown>
        const dirPath = typeof b.path === 'string' ? b.path : ''
        const target = path.join(STORAGE_DIR, dirPath)
        const safeDir = STORAGE_DIR + path.sep
        if (!target.startsWith(safeDir) && target !== STORAGE_DIR) {
          set.status = 403
          return { error: 'Forbidden' }
        }
        await mkdir(target, { recursive: true })
        return { ok: true }
      } catch (err) {
        console.error('storage mkdir failed', err)
        set.status = 500
        return { error: 'mkdir failed' }
      }
    }, { beforeHandle: requireAdmin })

    .delete('/remove', async ({ body, set }) => {
      try {
        const b = (body || {}) as Record<string, unknown>
        const targetPath = typeof b.path === 'string' ? b.path : ''
        const target = path.join(STORAGE_DIR, targetPath)
        const safeDir = STORAGE_DIR + path.sep
        if (!target.startsWith(safeDir) && target !== STORAGE_DIR) {
          set.status = 403
          return { error: 'Forbidden' }
        }
        const s = await stat(target)
        if (s.isDirectory()) {
          await rm(target, { recursive: true, force: true })
        } else {
          await unlink(target)
        }
        return { ok: true }
      } catch (err) {
        console.error('storage remove failed', err)
        set.status = 500
        return { error: 'remove failed' }
      }
    }, { beforeHandle: requireAdmin })

    .get('/read', async ({ query, set }) => {
      try {
        const targetPath = typeof query.path === 'string' ? query.path : ''
        const target = path.join(STORAGE_DIR, targetPath)
        const safeDir = STORAGE_DIR + path.sep
        if (!target.startsWith(safeDir) && target !== STORAGE_DIR) {
          set.status = 403
          return { error: 'Forbidden' }
        }
        const content = await readFile(target, 'utf-8')
        return { ok: true, content }
      } catch (err) {
        console.error('storage read failed', err)
        set.status = 500
        return { error: 'read failed' }
      }
    }, { beforeHandle: requireAdmin })

    .post('/write', async ({ body, set }) => {
      try {
        const b = (body || {}) as Record<string, unknown>
        const targetPath = typeof b.path === 'string' ? b.path : ''
        const content = typeof b.content === 'string' ? b.content : ''
        const target = path.join(STORAGE_DIR, targetPath)
        const safeDir = STORAGE_DIR + path.sep
        if (!target.startsWith(safeDir) && target !== STORAGE_DIR) {
          set.status = 403
          return { error: 'Forbidden' }
        }
        await ensureDir(path.dirname(target))
        await writeFile(target, content, 'utf-8')
        return { ok: true }
      } catch (err) {
        console.error('storage write failed', err)
        set.status = 500
        return { error: 'write failed' }
      }
    }, { beforeHandle: requireAdmin })
}
