import { createWriteStream } from 'node:fs'
import { requestBodyStream } from '../../lib/http-body.js'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import busboy from 'busboy'
import { Elysia } from 'elysia'
import { enforceSameOrigin } from '../../lib/request-origin.js'
import { requireAdmin } from '../../middleware/require-auth.js'
import { processCoverImage, convertAudioToHls, spawnRebuild, IMAGE_CONVERT_EXTS, runFfmpeg } from '../../lib/media-convert.js'
import type { DatabaseSync } from '../../lib/sqlite.js'
import type { ReleaseDownloadService } from '../../lib/release-download-service.js'
import { MDX_DIR, RELEASE_TYPES, MUSIC_ROOT, COVER_EXTS, TMP_DIR, readManifest, getAlbumDir, writeReleaseMdx } from './releases-validation.js'
import { slugify } from './shared.js'

export function createReleasesCrudRouter({ db, releaseService }: { db: DatabaseSync; releaseService: ReleaseDownloadService }) {
  return new Elysia()
    .get('/', async ({ set }) => {
      try {
        const manifestReleases = await readManifest()
        const dirents = await readdir(MUSIC_ROOT, { withFileTypes: true }).catch(() => [])
        const releases = await Promise.all(dirents.filter((d) => d.isDirectory()).map(async (d) => {
          const slug = slugify(d.name)
          const mRelease = manifestReleases.find((r) => r.slug === slug)

          // Always read tracks from filesystem (source of truth for which files exist)
          // and overlay titles from the manifest when available
          let tracks: Array<{ filename: string; title: string }> = []
          const sourceDir = path.join(MUSIC_ROOT, d.name, 'tracks', 'source')
          try {
            const audioExtRe = /\.(wav|mp3|flac|ogg|m4a|aac)$/i
            const files = (await readdir(sourceDir)).filter((f) => audioExtRe.test(f)).sort()

            // Build title map from manifest
            const titleMap = new Map<string, string>()
            const metaMap = new Map<string, { previewable?: boolean; isMain?: boolean }>()
            if (mRelease?.tracks) {
              for (const t of mRelease.tracks) {
                if (!t.sourceUrl) continue
                const tracksPrefix = `/media/music/${d.name}/tracks/`
                const fullRel = t.sourceUrl.startsWith(tracksPrefix) ? t.sourceUrl.slice(tracksPrefix.length) : path.basename(t.sourceUrl)
                const fn = fullRel.startsWith('source/') ? fullRel.slice('source/'.length) : fullRel
                if (t.title) titleMap.set(fn, t.title)
                metaMap.set(fn, { previewable: t.previewable, isMain: t.isMain })
              }
            }
            // Overlay with fresh .track-meta.json (source of truth for previewable/isMain) – manifest may be stale until rebuild
            try {
              const rawMeta = await readFile(path.join(MUSIC_ROOT, d.name, '.track-meta.json'), 'utf-8')
              const parsed = JSON.parse(rawMeta)
              const fresh = (parsed && typeof parsed === 'object' && parsed.tracks && typeof parsed.tracks === 'object') ? parsed.tracks : parsed
              if (fresh && typeof fresh === 'object') {
                for (const [fn, v] of Object.entries(fresh as Record<string, { previewable?: boolean; isMain?: boolean }>)) {
                  if (typeof v === 'object' && v !== null) metaMap.set(fn, { previewable: v.previewable, isMain: v.isMain })
                }
              }
            } catch { /* no meta file */ }

            tracks = files.map((f) => {
              const meta = metaMap.get(f)
              return {
                filename: f,
                title: titleMap.get(f) || '',
                previewable: meta?.previewable !== false,
                isMain: meta?.isMain === true,
              }
            })
          } catch { /* no source dir */ }

          // Read cover from filesystem when not in manifest
          let coverUrl: string | null = mRelease?.coverUrl ?? null
          let coverPreviewUrl: string | null = mRelease?.coverPreviewUrl ?? null
          if (!coverUrl) {
            const coverDir = path.join(MUSIC_ROOT, d.name, 'cover')
            try {
              const coverFiles = await readdir(coverDir)
              const webp = coverFiles.find((f) => f.endsWith('.webp') && !f.startsWith('cover-preview'))
              if (webp) coverUrl = `/media/music/${d.name}/cover/${webp}`
              const preview = coverFiles.find((f) => f.startsWith('cover-preview'))
              if (preview) coverPreviewUrl = `/media/music/${d.name}/cover/${preview}`
            } catch { /* cover directory may not exist */ }
          }

          // Read release metadata from filesystem when not in manifest
          let releaseDate: string | null = mRelease?.releaseDate ?? null
          if (!releaseDate) {
            try { releaseDate = (await readFile(path.join(MUSIC_ROOT, d.name, '.release-date'), 'utf-8')).trim() || null } catch { /* file optional */ }
          }
          let releaseType: string | null = mRelease?.releaseType ?? null
          if (!releaseType) {
            try { releaseType = (await readFile(path.join(MUSIC_ROOT, d.name, '.release-type'), 'utf-8')).trim() || null } catch { /* file optional */ }
          }

          const notesPath = path.join(MUSIC_ROOT, d.name, 'notes', 'notes')
          let notes = ''
          try { notes = await readFile(notesPath, 'utf-8') } catch { /* notes file optional */ }
          let isHidden = false
          try { const h = await readFile(path.join(MUSIC_ROOT, d.name, '.release-hidden'), 'utf-8'); isHidden = h.trim() === 'true' } catch { /* file optional */ }
          let links: Record<string, string | null> = { spotify: null, yandexMusic: null, bandcamp: null, soundcloud: null }
          try { const l = await readFile(path.join(MUSIC_ROOT, d.name, '.links'), 'utf-8'); const parsed = JSON.parse(l); if (parsed && typeof parsed === 'object') links = { ...links, ...parsed } } catch { /* file optional */ }
          let genres: { main: string[]; sub: string[] } | undefined
          try { const g = await readFile(path.join(MUSIC_ROOT, d.name, '.genre'), 'utf-8'); const parsed = JSON.parse(g); if (parsed && typeof parsed === 'object' && Array.isArray(parsed.main)) genres = { main: parsed.main, sub: Array.isArray(parsed.sub) ? parsed.sub : [] } } catch { /* file optional */ }
          return {
            slug, albumName: d.name, tracks,
            coverUrl, coverPreviewUrl,
            notes, releaseDate,
            releaseType: releaseType ?? 'album',
            hidden: isHidden,
            links,
            genres,
          }
        }))
        return { ok: true, releases }
      } catch (err) {
        console.error('admin releases list failed', err)
        set.status = 500
        return { error: 'Unable to list releases' }
      }
    }, { beforeHandle: requireAdmin })
    .post('/', ({ request, body, set }) => {
      return (async () => {
        const contentType = request.headers.get('content-type') || ''
        if (!contentType.includes('multipart/form-data')) {
          // Fallback to JSON for old clients
          const b = (body || {}) as Record<string, unknown>
          const albumName = typeof b.albumName === 'string' ? b.albumName.trim() : ''
          if (albumName.includes('..') || albumName.includes('/') || albumName.includes('\\')) {
            set.status = 400
            return { error: 'Invalid album name' }
          }
          if (!albumName) {
            set.status = 400
            return { error: 'albumName is required' }
          }
          const slug = slugify(albumName)
          if (!slug) {
            set.status = 400
            return { error: 'Invalid album name' }
          }
          const newDir = path.join(MUSIC_ROOT, albumName)
          try {
            await mkdir(newDir, { recursive: false })
          } catch (e) {
            if (typeof e === "object" && e !== null && "code" in e && e.code === "EEXIST") {
              set.status = 409
              return { error: 'Release with this name already exists' }
            }
            set.status = 500
            return { error: 'Unable to create release directory' }
          }

          const releaseType = typeof b.releaseType === 'string' && RELEASE_TYPES.includes(b.releaseType) ? b.releaseType as string : null
          if (!releaseType) {
            set.status = 400
            return { error: 'Invalid release type' }
          }
          const notes = typeof b.notes === 'string' ? b.notes : ''
          const releaseDate = typeof b.releaseDate === 'string' ? b.releaseDate.trim() : ''
          const hidden = b.hidden === true
          const newLinks = b.links && typeof b.links === 'object' ? b.links as Record<string, string | null> : null
          const artist = typeof b.artist === 'string' ? b.artist.trim() : ''
          const genres = b.genres && typeof b.genres === 'object' ? b.genres as { main?: string[]; sub?: string[] } : null

          try {
            await mkdir(path.join(newDir, 'tracks', 'source'), { recursive: true })
            await mkdir(path.join(newDir, 'tracks', 'stream'), { recursive: true })
            await mkdir(path.join(newDir, 'tracks', 'preview'), { recursive: true })
            await mkdir(path.join(newDir, 'cover'), { recursive: true })
            await mkdir(path.join(newDir, 'playlists'), { recursive: true })
            await mkdir(path.join(newDir, 'notes'), { recursive: true })
            if (notes) await writeFile(path.join(newDir, 'notes', 'notes'), notes, 'utf-8')
            if (releaseDate) await writeFile(path.join(newDir, '.release-date'), releaseDate, 'utf-8')
            if (releaseType !== 'album') await writeFile(path.join(newDir, '.release-type'), releaseType, 'utf-8')
            if (hidden) await writeFile(path.join(newDir, '.release-hidden'), 'true', 'utf-8')
            if (newLinks) {
              const links: Record<string, string | null> = { spotify: null, yandexMusic: null, bandcamp: null, soundcloud: null }
              for (const key of Object.keys(links)) {
                const v = newLinks[key]
                links[key] = typeof v === 'string' && v.trim() ? v.trim() : null
              }
              await writeFile(path.join(newDir, '.links'), JSON.stringify(links), 'utf-8')
            }
            if (artist) await writeFile(path.join(newDir, '.artist'), artist, 'utf-8')
            if (genres && (genres.main?.length || genres.sub?.length)) {
              await writeFile(path.join(newDir, '.genre'), JSON.stringify({ main: genres.main || [], sub: genres.sub || [] }), 'utf-8')
            }
            spawnRebuild()
            writeReleaseMdx(slug, newDir).catch((e) => console.error('writeReleaseMdx failed', e))
            return { ok: true, slug }
          } catch (err) {
            console.error('admin release create failed', err)
            set.status = 500
            return { error: 'Unable to create release' }
          }
        }

        // multipart/form-data: albumName, releaseType, releaseDate, notes, hidden, links (JSON), tracks[], cover
        let albumName = ''
        let releaseType = 'album'
        let releaseDate = ''
        let notes = ''
        let hidden = false
        let linksJson: Record<string, string | null> | null = null
        const trackFiles: Array<{ filename: string; path: string }> = []
        const trackNames: string[] = []
        const hlsJobs: Array<Promise<unknown>> = []
        let coverFile: { filename: string; path: string } | null = null

        try {
          await new Promise<void>((resolve, reject) => {
            const bb = busboy({ headers: Object.fromEntries(request.headers.entries()), limits: { fileSize: 10 * 1024 * 1024 * 1024 } }) // 10GB per file
            const pending: Promise<void>[] = []
            bb.on('field', (name: string, val: string) => {
              if (name === 'albumName') albumName = val.trim()
              else if (name === 'releaseType') releaseType = val.trim()
              else if (name === 'releaseDate') releaseDate = val.trim()
              else if (name === 'notes') notes = val
              else if (name === 'hidden') hidden = val === 'true'
              else if (name === 'trackNames') trackNames.push(val)
              else if (name === 'links') {
                try {
                  const parsed = JSON.parse(val)
                  if (parsed && typeof parsed === 'object') linksJson = parsed
                } catch { /* ignore malformed links payload */ }
              }
            })
            bb.on('file', (field: string, stream: NodeJS.ReadableStream, info: { filename: string }) => {
              if (field === 'cover') {
                const ext = path.extname(info.filename).toLowerCase()
                if (!COVER_EXTS.has(ext) && !IMAGE_CONVERT_EXTS.has(ext)) { stream.resume(); return }
                const tmpPath = path.join(TMP_DIR, `cover-${Date.now()}${ext}`)
                const ws = createWriteStream(tmpPath)
                stream.pipe(ws)
                pending.push(new Promise<void>((r, j) => { ws.on('finish', () => { coverFile = { filename: info.filename, path: tmpPath }; r() }); ws.on('error', j); stream.on('error', j) }))
              } else if (field === 'tracks') {
                const tmpPath = path.join(TMP_DIR, `track-${Date.now()}-${info.filename}`)
                const ws = createWriteStream(tmpPath)
                stream.pipe(ws)
                pending.push(new Promise<void>((r, j) => { ws.on('finish', () => { trackFiles.push({ filename: info.filename, path: tmpPath }); r() }); ws.on('error', j); stream.on('error', j) }))
              } else {
                stream.resume()
              }
            })
            bb.on('error', reject)
            bb.on('finish', () => Promise.all(pending).then(() => resolve()).catch(reject))
            requestBodyStream(request.body).pipe(bb)
          })

          if (albumName.includes('..') || albumName.includes('/') || albumName.includes('\\')) {
            set.status = 400
            return { error: 'Invalid album name' }
          }
          if (!albumName) {
            set.status = 400
            return { error: 'albumName is required' }
          }
          const slug = slugify(albumName)
          if (!slug) {
            set.status = 400
            return { error: 'Invalid album name' }
          }
          const newDir = path.join(MUSIC_ROOT, albumName)
          try {
            await mkdir(newDir, { recursive: false })
          } catch (e) {
            if (typeof e === "object" && e !== null && "code" in e && e.code === "EEXIST") {
              set.status = 409
              return { error: 'Release with this name already exists' }
            }
            set.status = 500
            return { error: 'Unable to create release directory' }
          }

          await mkdir(path.join(newDir, 'tracks', 'source'), { recursive: true })
          await mkdir(path.join(newDir, 'tracks', 'stream'), { recursive: true })
          await mkdir(path.join(newDir, 'tracks', 'preview'), { recursive: true })
          await mkdir(path.join(newDir, 'cover'), { recursive: true })
          await mkdir(path.join(newDir, 'playlists'), { recursive: true })
          await mkdir(path.join(newDir, 'notes'), { recursive: true })
          if (notes) await writeFile(path.join(newDir, 'notes', 'notes'), notes, 'utf-8')
          if (releaseDate) await writeFile(path.join(newDir, '.release-date'), releaseDate, 'utf-8')
          if (releaseType !== 'album') await writeFile(path.join(newDir, '.release-type'), releaseType, 'utf-8')
          if (hidden) await writeFile(path.join(newDir, '.release-hidden'), 'true', 'utf-8')
          if (linksJson) {
            const parsedLinks = linksJson as Record<string, string | null>
            const links: Record<string, string | null> = { spotify: null, yandexMusic: null, bandcamp: null, soundcloud: null }
            for (const key of Object.keys(links)) {
              const v = parsedLinks[key]
              links[key] = typeof v === 'string' && v.trim() ? v.trim() : null
            }
            await writeFile(path.join(newDir, '.links'), JSON.stringify(links), 'utf-8')
          }
          const sourceDir = path.join(newDir, 'tracks', 'source')
          const streamDir = path.join(newDir, 'tracks', 'stream')
          for (let i = 0; i < trackFiles.length; i++) {
            const track = trackFiles[i]
            const customName = trackNames[i]
            const ext = path.extname(track.filename)
            const finalName = customName ? `${customName}${ext}` : track.filename
            const dest = path.join(sourceDir, finalName)
            await rename(track.path, dest)
            // Convert to WAV if not already
            let hlsSrc = dest
            let hlsName = finalName
            if (ext !== '.wav') {
              const wavDest = path.join(sourceDir, `${path.basename(finalName, ext)}.wav`)
              try {
                await runFfmpeg(['-y', '-i', dest, '-c:a', 'pcm_s16le', '-f', 'wav', wavDest])
                await rm(dest, { force: true })
                hlsSrc = wavDest
                hlsName = path.basename(wavDest)
              } catch (err) {
                console.error('WAV conversion failed for', finalName, err)
              }
            }
            // Generate HLS in background; regenerate manifest once all conversions finish
            const trackStreamDir = path.join(streamDir, path.basename(hlsName, '.wav'))
            await mkdir(trackStreamDir, { recursive: true })
            hlsJobs.push(convertAudioToHls(hlsSrc, trackStreamDir).catch((e) => console.error('HLS gen failed for', hlsName, e)))
          }
          if (hlsJobs.length > 0) {
            void Promise.allSettled(hlsJobs).then(() => spawnRebuild())
          }

          // Process cover
          if (coverFile) {
            const cover = coverFile as { filename: string; path: string }
            const coverDir = path.join(newDir, 'cover')
            const coverExt = path.extname(cover.filename).toLowerCase()
            const coverDest = path.join(coverDir, `cover${coverExt}`)
            await rename(cover.path, coverDest)
            await processCoverImage(coverDest, coverDir).catch((e) => console.error('Cover processing failed', e))
          }

          spawnRebuild()
          writeReleaseMdx(slug, newDir).catch((e) => console.error('writeReleaseMdx failed', e))
          return { ok: true, slug }
        } catch (err) {
          console.error('admin release create failed', err)
          // Cleanup tmp files
          for (const track of trackFiles) {
            await rm(track.path, { force: true }).catch(() => {})
          }
          if (coverFile) {
            const cover = coverFile as { filename: string; path: string }
            await rm(cover.path, { force: true }).catch(() => {})
          }
          set.status = 500
          return { error: 'Unable to create release' }
        }
      })()
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
    .patch('/:slug', async ({ params, body, set }) => {
      const slug = typeof params.slug === 'string' ? params.slug.trim() : ''
      if (!slug) {
        set.status = 400
        return { error: 'Invalid slug' }
      }

      const album = await getAlbumDir(slug)
      if (!album) {
        set.status = 404
        return { error: 'Release not found' }
      }

      const albumDir = album.dir
      const b = (body || {}) as Record<string, unknown>
      const rawAlbumName = typeof b.albumName === 'string' ? b.albumName.trim() : ''
      const newAlbumName = rawAlbumName || null
      if (newAlbumName !== null && (newAlbumName.includes('..') || newAlbumName.includes('/') || newAlbumName.includes('\\'))) {
        set.status = 400
        return { error: 'Invalid album name' }
      }
      const newNotes = typeof b.notes === 'string' ? b.notes : null
      const newReleaseType = typeof b.releaseType === 'string' ? b.releaseType : null
      const newHidden = b.hidden !== undefined ? Boolean(b.hidden) : null
      const trackRenames = b.trackRenames && typeof b.trackRenames === 'object' ? b.trackRenames as Record<string, string> : null
      const trackDeletes = Array.isArray(b.trackDeletes) ? b.trackDeletes as string[] : null
      const newLinks = b.links && typeof b.links === 'object' ? b.links as Record<string, string | null> : null
      const newTrackMeta = b.trackMeta && typeof b.trackMeta === 'object' ? b.trackMeta as Record<string, { previewable?: boolean; isMain?: boolean }> : null
      const newGenres = b.genres && typeof b.genres === 'object' ? b.genres as { main?: string[]; sub?: string[] } : null

      try {
        if (newNotes !== null) {
          const notesDir = path.join(albumDir, 'notes')
          await mkdir(notesDir, { recursive: true })
          await writeFile(path.join(notesDir, 'notes'), newNotes, 'utf-8')
        }

        if (newReleaseType !== null) {
          // release type is stored in the manifest after rebuild; for now we write it as a marker file
          const typeFile = path.join(albumDir, '.release-type')
          await writeFile(typeFile, newReleaseType, 'utf-8')
        }

        if (newHidden !== null) {
          const hiddenFile = path.join(albumDir, '.release-hidden')
          if (newHidden) await writeFile(hiddenFile, 'true', 'utf-8')
          else await rm(hiddenFile, { force: true }).catch(() => {})
        }

        if (newLinks !== null) {
          const linksFile = path.join(albumDir, '.links')
          const existing: Record<string, string | null> = { spotify: null, yandexMusic: null, bandcamp: null, soundcloud: null }
          try { const l = await readFile(linksFile, 'utf-8'); const parsed = JSON.parse(l); if (parsed && typeof parsed === 'object') Object.assign(existing, parsed) } catch { /* file optional */ }
          await writeFile(linksFile, JSON.stringify({ ...existing, ...newLinks }), 'utf-8')
        }

        if (newGenres !== null) {
          const main = Array.isArray(newGenres.main) ? newGenres.main.filter((g): g is string => typeof g === 'string') : undefined
          const sub = Array.isArray(newGenres.sub) ? newGenres.sub.filter((g): g is string => typeof g === 'string') : undefined
          if (main !== undefined || sub !== undefined) {
            const genreFile = path.join(albumDir, '.genre')
            const existing: { main: string[]; sub: string[] } = { main: [], sub: [] }
            try { const g = await readFile(genreFile, 'utf-8'); const parsed = JSON.parse(g); if (parsed && typeof parsed === 'object') { if (Array.isArray(parsed.main)) existing.main = parsed.main; if (Array.isArray(parsed.sub)) existing.sub = parsed.sub } } catch { /* file optional */ }
            if (main !== undefined) existing.main = main
            if (sub !== undefined) existing.sub = sub
            await writeFile(genreFile, JSON.stringify(existing, null, 2), 'utf-8')
          }
        }

        if (newTrackMeta !== null) {
          const trackMetaFile = path.join(albumDir, '.track-meta.json')
          const existingMeta: Record<string, { previewable?: boolean; isMain?: boolean }> = {}
          try {
            const m = await readFile(trackMetaFile, 'utf-8')
            const parsed = JSON.parse(m)
            if (parsed && typeof parsed === 'object') {
              Object.assign(existingMeta, (parsed.tracks && typeof parsed.tracks === 'object') ? parsed.tracks : parsed)
            }
          } catch { /* file optional */ }
          // Only persist keys for files that still exist in the source directory.
          const sourceDir = path.join(albumDir, 'tracks', 'source')
          const sourceFiles = (await readdir(sourceDir).catch(() => [])).filter((f) => /\.(wav|mp3|flac|ogg|m4a|aac)$/i.test(f))
          const merged: Record<string, { previewable?: boolean; isMain?: boolean }> = {}
          for (const f of sourceFiles) {
            merged[f] = { ...(existingMeta[f] || {}), ...(newTrackMeta[f] || {}) }
          }
          await writeFile(trackMetaFile, JSON.stringify({ tracks: merged }, null, 2), 'utf-8')
        }

        if (Array.isArray(trackDeletes)) {
          const tracksDir = path.join(albumDir, 'tracks')
          for (const filename of trackDeletes) {
            if (typeof filename !== 'string' || filename.includes('..')) continue
            for (const subDir of ['source', 'stream', 'preview']) {
              const p = path.resolve(path.join(tracksDir, subDir), filename)
              if (p.startsWith(path.join(tracksDir, subDir) + path.sep)) {
                await rm(p, { force: true }).catch(() => {})
              }
            }
          }
        }

        if (trackRenames) {
          const tracksDir = path.join(albumDir, 'tracks')
          for (const [oldName, newName] of Object.entries(trackRenames)) {
            if (oldName.includes('..') || newName.includes('..')) continue
            for (const subDir of ['source', 'stream', 'preview']) {
              const oldPath = path.resolve(path.join(tracksDir, subDir), oldName)
              const newPath = path.resolve(path.join(tracksDir, subDir), newName)
              if (oldPath.startsWith(path.join(tracksDir, subDir) + path.sep) && newPath.startsWith(path.join(tracksDir, subDir) + path.sep)) {
                await rename(oldPath, newPath).catch(() => {})
              }
            }
          }
        }

        let finalDir = albumDir
        if (newAlbumName && newAlbumName !== album.name) {
          const newDir = path.join(MUSIC_ROOT, newAlbumName)
          try {
            await rename(albumDir, newDir)
          } catch (e) {
            if (typeof e === "object" && e !== null && "code" in e && e.code === "EXDEV") {
              const { cp } = await import('node:fs/promises')
              await cp(albumDir, newDir, { recursive: true })
              await rm(albumDir, { recursive: true, force: true })
            } else {
              throw e
            }
          }
          finalDir = newDir
        }

        releaseService.invalidateCache(slug)
        if (newAlbumName && slugify(newAlbumName) !== slug) releaseService.invalidateCache(slugify(newAlbumName))
        spawnRebuild()
        writeReleaseMdx(slugify(path.basename(finalDir)), finalDir).catch((e) => console.error('writeReleaseMdx failed', e))
        return { ok: true, slug: slugify(path.basename(finalDir)) }
      } catch (err) {
        console.error('admin release patch failed', err)
        set.status = 500
        return { error: 'Unable to update release' }
      }
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
    // ── Regenerate all caches ──
    .post('/regenerate-all', async ({ set }) => {
      try {
        const jobId = await releaseService.startRegenerateAllJob()
        return { ok: true, jobId }
      } catch (err) {
        console.error('admin regenerate-all failed', err)
        set.status = 500
        return { error: 'Unable to start regeneration' }
      }
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
    // ── Regenerate manifest ──
    .post('/regenerate-manifest', async ({ set }) => {
      try {
        const jobId = await releaseService.startRegenerateManifestJob()
        return { ok: true, jobId }
      } catch (err) {
        console.error('admin regenerate-manifest failed', err)
        set.status = 500
        return { error: 'Unable to regenerate manifest' }
      }
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
    .delete('/:slug', async ({ params, set }) => {
      const slug = typeof params.slug === 'string' ? params.slug.trim() : ''
      if (!slug) {
        set.status = 400
        return { error: 'Invalid slug' }
      }
      const album = await getAlbumDir(slug)
      if (!album) {
        set.status = 404
        return { error: 'Release not found' }
      }
      try {
        releaseService.invalidateCache(slug)
        await rm(album.dir, { recursive: true, force: true })
        await rm(path.join(MDX_DIR('en'), `${slug}.mdx`), { force: true })
        await rm(path.join(MDX_DIR('ru'), `${slug}.mdx`), { force: true })
        // Remove from DB: tracks first (FK), then release, then artist if orphan
        const releaseRow = db.prepare('SELECT id, artist_id FROM releases WHERE slug = ?').get(slug) as { id: number; artist_id: number } | undefined
        if (releaseRow) {
          db.prepare('DELETE FROM tracks WHERE release_id = ?').run(releaseRow.id)
          db.prepare('DELETE FROM releases WHERE id = ?').run(releaseRow.id)
        }
        spawnRebuild()
        return { ok: true }
      } catch (err) {
        console.error('admin release delete failed', err)
        set.status = 500
        return { error: 'Unable to delete release' }
      }
    }, { beforeHandle: [enforceSameOrigin, requireAdmin] })
}
