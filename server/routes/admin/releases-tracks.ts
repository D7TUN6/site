import { createWriteStream } from 'node:fs'
import { requestBodyStream } from '../../lib/http-body.js'
import { mkdir, readFile, readdir, rm, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import busboy from 'busboy'
import { Elysia } from 'elysia'
import { enforceSameOrigin } from '../../lib/request-origin.js'
import { requireAdmin } from '../../middleware/require-auth.js'
import { convertAudioToHls, runFfmpeg, spawnRebuild } from '../../lib/media-convert.js'
import type { ReleaseDownloadService } from '../../lib/release-download-service.js'
import { getAlbumDir, writeReleaseMdx } from './releases-validation.js'

type TrackMetaEntry = { previewable?: boolean; isMain?: boolean }

async function mergeTrackMeta(albumDir: string, updater: (meta: Record<string, TrackMetaEntry>) => Record<string, TrackMetaEntry>) {
  const metaFile = path.join(albumDir, '.track-meta.json')
  let meta: Record<string, TrackMetaEntry> = {}
  try {
    const parsed = JSON.parse(await readFile(metaFile, 'utf-8'))
    if (parsed && typeof parsed === 'object') {
      Object.assign(meta, (parsed.tracks && typeof parsed.tracks === 'object') ? parsed.tracks : parsed)
    }
  } catch { /* file optional */ }
  meta = updater(meta)
  await writeFile(metaFile, JSON.stringify({ tracks: meta }, null, 2), 'utf-8')
}

export function createReleasesTracksRouter({ releaseService }: { releaseService: ReleaseDownloadService }) {
  // Serialize concurrent reorder requests for the same release (double-clicks,
  // retried saves) — interleaved renames previously left files stranded.
  const reorderLocks = new Map<string, Promise<unknown>>()

  return new Elysia()
    .post('/:slug/tracks', ({ request, params, set }) => {
      return (async () => {
        const slug = typeof params.slug === 'string' ? params.slug.trim() : ''
        const album = await getAlbumDir(slug)
        if (!album) {
          set.status = 404
          return { error: 'Release not found' }
        }

        const contentType = request.headers.get('content-type') || ''
        if (!contentType.includes('multipart/form-data')) {
          set.status = 400
          return { error: 'Expected multipart/form-data' }
        }

        const tracksDir = path.join(album.dir, 'tracks')
        const sourceDir = path.join(tracksDir, 'source')
        const streamDir = path.join(tracksDir, 'stream')
        const previewDir = path.join(tracksDir, 'preview')
        await mkdir(sourceDir, { recursive: true })
        await mkdir(streamDir, { recursive: true })
        await mkdir(previewDir, { recursive: true })

        let flagPreviewable: boolean | null = null
        let flagIsMain: boolean | null = null
        const orderValues: number[] = []
        const pendingTmps: Array<{ tmpPath: string; field: string; base: string; ext: string }> = []
        const pendingWrites: Promise<void>[] = []
        try {
          await new Promise<void>((resolve, reject) => {
            const bb = busboy({ headers: Object.fromEntries(request.headers.entries()), limits: { fileSize: 10 * 1024 * 1024 * 1024 } }) // 10GB per file
            bb.on('field', (name: string, val: string) => {
              if (name === 'order') {
                const n = parseInt(val, 10)
                if (Number.isFinite(n)) orderValues.push(n)
              } else if (name === 'previewable') flagPreviewable = val === 'true'
              else if (name === 'isMain') flagIsMain = val === 'true'
            })
            bb.on('file', (field: string, stream: NodeJS.ReadableStream, info: { filename: string }) => {
              const ext = path.extname(info.filename).toLowerCase()
              const base = path.basename(info.filename, ext)
              // write to temp file first to avoid prefix race when fields arrive after files
              const rnd = Math.random().toString(36).slice(2, 8)
              const tmpName = `.upload_tmp_${Date.now()}_${rnd}_${base}${ext}`
              const tmpPath = path.join(sourceDir, tmpName)
              pendingTmps.push({ tmpPath, field, base, ext })
              const ws = createWriteStream(tmpPath)
              stream.pipe(ws)
              pendingWrites.push(new Promise<void>((r, j) => { ws.on('finish', r); ws.on('error', j); stream.on('error', j) }))
            })
            bb.on('error', reject)
            bb.on('finish', () => Promise.all(pendingWrites).then(() => resolve()).catch(reject))
            requestBodyStream(request.body).pipe(bb)
          })

          if (!pendingTmps.length) {
            set.status = 400
            return { error: 'No valid audio files received' }
          }

          // Determine final prefixed names – handle bulk where order fields were sent per-file
          const existingBefore = (await readdir(sourceDir).catch(() => [] as string[])).filter((f) => /\.(wav|mp3|flac|ogg|m4a|aac)$/i.test(f) && !f.startsWith('.upload_tmp_'))
          const existingCount = existingBefore.length
          const total = existingCount + pendingTmps.length
          const prefixLen = Math.max(2, String(total).length)
          const saved: string[] = []
          for (let i = 0; i < pendingTmps.length; i++) {
            const tmp = pendingTmps[i]
            if (tmp.field !== 'tracks') {
              const safeName = `${tmp.base}${tmp.ext}`
              const dest = path.join(sourceDir, safeName)
              await rename(tmp.tmpPath, dest)
              saved.push(safeName)
              continue
            }
            // For bulk tracks, orderValues[i] corresponds to file i when client appends (order, file) pairs
            let orderIdx: number
            if (i < orderValues.length && Number.isFinite(orderValues[i])) {
              orderIdx = orderValues[i]
            } else if (orderValues.length === 1 && pendingTmps.length === 1) {
              orderIdx = orderValues[0]
            } else {
              orderIdx = existingCount + i
            }
            // Clamp to valid range and convert to 1-based padded prefix
            orderIdx = Math.max(0, Math.min(total - 1, orderIdx))
            const padded = String(orderIdx + 1).padStart(prefixLen, '0')
            const safeName = `${padded}__${tmp.base}${tmp.ext}`
            const dest = path.join(sourceDir, safeName)
            // Avoid overwriting existing file with same name – add suffix if collision and not same tmp
            let finalDest = dest
            let dup = 1
            while (true) {
              try { await readFile(finalDest); finalDest = path.join(sourceDir, `${padded}__${tmp.base}_${dup}${tmp.ext}`); dup++ } catch { break }
            }
            await rename(tmp.tmpPath, finalDest)
            saved.push(path.basename(finalDest))
          }

          // Clean any stray tmp files
          for (const tmp of pendingTmps) {
            try { await rm(tmp.tmpPath, { force: true }) } catch {}
          }

          if (!saved.length) {
            set.status = 400
            return { error: 'No valid audio files received' }
          }

      // Convert to WAV and generate HLS stream for each track
      const hlsJobs: Array<Promise<unknown>> = []
      for (const filename of saved) {
        const srcPath = path.join(sourceDir, filename)
        const ext = path.extname(filename).toLowerCase()
        let wavSrc = srcPath
        let wavName = filename
        if (ext !== '.wav') {
          const wavPath = path.join(sourceDir, `${path.basename(filename, ext)}.wav`)
          try {
            await runFfmpeg(['-y', '-i', srcPath, '-c:a', 'pcm_s16le', '-f', 'wav', wavPath])
            await rm(srcPath, { force: true })
            wavSrc = wavPath
            wavName = path.basename(wavPath)
          } catch (err) {
            console.error('WAV conversion failed for', filename, err)
          }
        }
        const trackStreamDir = path.join(streamDir, path.basename(wavName, '.wav'))
        await mkdir(trackStreamDir, { recursive: true })
        hlsJobs.push(convertAudioToHls(wavSrc, trackStreamDir).catch((e) => console.error('HLS gen failed for', wavName, e)))
      }

      // Persist per-track pre-order flags sent with the upload (create flow)
      if (flagPreviewable !== null || flagIsMain !== null) {
        const finalNames = (await readdir(sourceDir)).filter((f) => saved.includes(f) || saved.some((s) => path.basename(s, path.extname(s)) === path.basename(f, path.extname(f))))
        await mergeTrackMeta(album.dir, (meta) => {
          for (const f of finalNames) {
            const entry = { ...(meta[f] || {}) } as TrackMetaEntry
            if (flagPreviewable !== null) entry.previewable = flagPreviewable
            if (flagIsMain !== null) entry.isMain = flagIsMain
            meta[f] = entry
          }
          return meta
        })
      }

      // Regenerate the manifest once HLS conversions settle so streamUrls appear
      if (hlsJobs.length > 0) {
        void Promise.allSettled(hlsJobs).then(() => spawnRebuild())
      }

      releaseService.invalidateCache(slug)
      spawnRebuild()
      writeReleaseMdx(slug, album.dir).catch((e) => console.error('writeReleaseMdx failed', e))
      return { ok: true, files: saved }
        } catch (err) {
          console.error('admin release tracks upload failed', err)
          set.status = 500
          return { error: 'Unable to upload tracks' }
        }
      })()
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })

  .post('/:slug/tracks/reorder', ({ params, body, set }) => {
    return (async () => {
      const slug = typeof params.slug === 'string' ? params.slug.trim() : ''
      const album = await getAlbumDir(slug)
      if (!album) {
        set.status = 404
        return { error: 'Release not found' }
      }

      const b = (body || {}) as Record<string, unknown>
      const order = Array.isArray(b.order) ? b.order as string[] : []
      if (order.length === 0) {
        set.status = 400
        return { error: 'Order array required' }
      }

    const sourceDir = path.join(album.dir, 'tracks', 'source')

    const runReorder = async (): Promise<{ reordered: number; skipped: number }> => {
      const files = await readdir(sourceDir).catch(() => [] as string[])

      // First, clean up any leftover .reorder-tmp files from previous aborted reorders
      for (const f of files) {
        if (f.endsWith('.reorder-tmp')) {
          const clean = f.slice(0, -'.reorder-tmp'.length)
          await rename(path.join(sourceDir, f), path.join(sourceDir, clean)).catch(() => {})
        }
      }

      // Now apply new order using a .reorder-tmp suffix for atomicity
      const prefixLen = String(order.length).length
      const reorderSuffix = `.reorder-tmp`
      // Strip ALL accumulated numeric prefixes so reordering never stacks them
      // (previously each save prepended another "01__" layer).
      const stripPrefixes = (name: string) => name.replace(/^(\d+__)+/, '')

      // Only process files that are in the order array
      const renamed: Array<{ from: string; to: string }> = []
      for (let i = 0; i < order.length; i++) {
        const raw = order[i]
        if (!raw || raw.includes('..')) continue
        // Strip any directory prefix (e.g. "source/") for matching
        const original = stripPrefixes(raw.replace(/^.*[/\\]/, ''))
        // Find the file in source dir regardless of how many old numeric prefixes it has
        const sourceFile = files.find((f) => stripPrefixes(f) === original && !f.endsWith(reorderSuffix))
        if (!sourceFile) continue
        const padded = String(i + 1).padStart(prefixLen, '0')
        const finalName = `${padded}__${original}`
        if (sourceFile === finalName) continue
        const tmpName = `${finalName}${reorderSuffix}`
        try {
          // Two-phase per-file rename avoids target collisions between swaps;
          // both phases happen immediately so a crash can strand at most one tmp.
          await rename(path.join(sourceDir, sourceFile), path.join(sourceDir, tmpName))
          await rename(path.join(sourceDir, tmpName), path.join(sourceDir, finalName))
        } catch (err) {
          console.warn('admin reorder: skipping unrenamable track', sourceFile, err)
          continue
        }
        renamed.push({ from: sourceFile, to: finalName })
        // Keep the listing fresh so subsequent finds see the new names
        const listIdx = files.indexOf(sourceFile)
        if (listIdx >= 0) files[listIdx] = finalName
      }
      // Clean up any leftover reorder-tmp files
      const finalFiles = await readdir(sourceDir).catch(() => [] as string[])
      for (const f of finalFiles) {
        if (f.endsWith(reorderSuffix)) {
          const clean = f.slice(0, -reorderSuffix.length)
          await rename(path.join(sourceDir, f), path.join(sourceDir, clean)).catch(() => {})
        }
      }

      // Keep .track-meta.json entries attached to their tracks after renames
      if (renamed.length > 0) {
        await mergeTrackMeta(album.dir, (meta) => {
          const next: Record<string, TrackMetaEntry> = {}
          const renameMap = new Map(renamed.map((r) => [r.from, r.to]))
          for (const [key, value] of Object.entries(meta)) {
            const newKey = renameMap.get(key) ?? key
            next[newKey] = { ...(next[newKey] || {}), ...value }
          }
          return next
        })
      }

      releaseService.invalidateCache(slug)
      spawnRebuild()
      return { reordered: renamed.length, skipped: order.length - renamed.length }
    }

    const prev = reorderLocks.get(album.dir) ?? Promise.resolve()
    const task = prev.catch(() => {}).then(runReorder)
    reorderLocks.set(album.dir, task)
    void task.finally(() => {
      if (reorderLocks.get(album.dir) === task) reorderLocks.delete(album.dir)
    }).catch(() => {})
    try {
      const stats = await task
      return { ok: true, message: 'Track order saved', ...stats }
    } catch (err) {
      console.error('admin release tracks reorder failed', err)
      set.status = 500
      return { error: 'Unable to reorder tracks' }
    }
      })()
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
}

export async function cleanupTempFiles(root: string) {
  try {
    const dirs = await readdir(root, { withFileTypes: true })
    for (const d of dirs) {
      if (!d.isDirectory()) continue
      const sourceDir = path.join(root, d.name, 'tracks', 'source')
      try {
        const files = await readdir(sourceDir)
        let changed = false
        for (const f of files) {
          if (f.endsWith('.reorder-tmp')) {
            const clean = f.slice(0, -13)
            await rename(path.join(sourceDir, f), path.join(sourceDir, clean)).catch(() => {})
            changed = true
          }
          // Recover files with _tmp_ prefix from old race condition bugs
          const oldTmp = f.match(/^_+tmp_\d+_+(.+)$/)
          if (oldTmp && oldTmp[1]) {
            const cleanName = oldTmp[1]
            await rename(path.join(sourceDir, f), path.join(sourceDir, cleanName)).catch(() => {})
            changed = true
          }
        }
        if (changed) { /* cleaned up temp files */ }
      } catch { /* no source dir, skip */ }
    }
  } catch { /* no music root */ }
}
