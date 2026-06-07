import { readdir, stat, readFile, writeFile, unlink, mkdir, rm, rename } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import path from 'node:path'
import express from 'express'
import Busboy from 'busboy'
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
  const router = express.Router()

  router.get('/list', requireAdmin, async (req, res) => {
    try {
      const sub = typeof req.query.path === 'string' ? req.query.path : ''
      const target = path.join(STORAGE_DIR, sub)
      if (!target.startsWith(STORAGE_DIR)) return res.status(403).json({ error: 'Forbidden' })
      const entries = await listDir(target, STORAGE_DIR)
      res.json({ ok: true, entries })
    } catch (err) {
      console.error('storage list failed', err)
      res.status(500).json({ error: 'Unable to list storage' })
    }
  })

  router.post('/upload', requireAdmin, (req, res) => {
    const sub = typeof req.query.path === 'string' ? req.query.path : ''
    const targetDir = path.join(STORAGE_DIR, sub)
    if (!targetDir.startsWith(STORAGE_DIR)) return res.status(403).json({ error: 'Forbidden' })

    const busboy = Busboy({ headers: req.headers as Record<string, string> | undefined, limits: { fileSize: 1024 * 1024 * 1024 } })
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
      if (!res.headersSent) res.status(500).json({ error: 'Upload failed' })
    })

    busboy.on('finish', () => {
      if (hasError) return
      res.json({ ok: true, files: uploaded })
    })

    req.pipe(busboy)
  })

  router.post('/mkdir', requireAdmin, async (req, res) => {
    try {
      const dirPath = typeof req.body.path === 'string' ? req.body.path : ''
      const target = path.join(STORAGE_DIR, dirPath)
      if (!target.startsWith(STORAGE_DIR)) return res.status(403).json({ error: 'Forbidden' })
      await mkdir(target, { recursive: true })
      res.json({ ok: true })
    } catch (err) {
      console.error('storage mkdir failed', err)
      res.status(500).json({ error: 'mkdir failed' })
    }
  })

  router.delete('/remove', requireAdmin, async (req, res) => {
    try {
      const targetPath = typeof req.body.path === 'string' ? req.body.path : ''
      const target = path.join(STORAGE_DIR, targetPath)
      if (!target.startsWith(STORAGE_DIR)) return res.status(403).json({ error: 'Forbidden' })
      const s = await stat(target)
      if (s.isDirectory()) {
        await rm(target, { recursive: true, force: true })
      } else {
        await unlink(target)
      }
      res.json({ ok: true })
    } catch (err) {
      console.error('storage remove failed', err)
      res.status(500).json({ error: 'remove failed' })
    }
  })

  router.get('/read', requireAdmin, async (req, res) => {
    try {
      const targetPath = typeof req.query.path === 'string' ? req.query.path : ''
      const target = path.join(STORAGE_DIR, targetPath)
      if (!target.startsWith(STORAGE_DIR)) return res.status(403).json({ error: 'Forbidden' })
      const content = await readFile(target, 'utf-8')
      res.json({ ok: true, content })
    } catch (err) {
      console.error('storage read failed', err)
      res.status(500).json({ error: 'read failed' })
    }
  })

  router.post('/write', requireAdmin, async (req, res) => {
    try {
      const targetPath = typeof req.body.path === 'string' ? req.body.path : ''
      const content = typeof req.body.content === 'string' ? req.body.content : ''
      const target = path.join(STORAGE_DIR, targetPath)
      if (!target.startsWith(STORAGE_DIR)) return res.status(403).json({ error: 'Forbidden' })
      await ensureDir(path.dirname(target))
      await writeFile(target, content, 'utf-8')
      res.json({ ok: true })
    } catch (err) {
      console.error('storage write failed', err)
      res.status(500).json({ error: 'write failed' })
    }
  })

  return router
}
