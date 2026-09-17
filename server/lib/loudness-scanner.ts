import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import type { DatabaseSync } from './sqlite.js'
import { audioConfig } from './audio-config.js'
import { syncManifestToDb } from './manifest-sync.js'
import type { ManifestRelease } from './release-download-types.js'

const ROOT = process.cwd()
const MANIFEST_PATH = path.join(ROOT, 'src', 'generated', 'release-manifest.json')

type LoudnessResult = { integratedLoudness: number; truePeak: number }

function scanLoudness(filePath: string): Promise<LoudnessResult> {
  return new Promise((resolve, reject) => {
    const ff = spawn(audioConfig.ffmpeg.path, [
      '-hide_banner', '-i', filePath,
      '-af', 'ebur128=peak=true',
      '-f', 'null', '-',
    ], { stdio: ['ignore', 'pipe', 'pipe'] })

    let stderr = ''
    ff.stderr.on('data', (c: Buffer) => { stderr += String(c) })
    ff.on('error', reject)
    ff.on('close', (code) => {
      if (code !== 0 && code !== 1) return reject(new Error(stderr || `ffmpeg exit ${code}`))

      let integratedLoudness = -70
      let truePeak = -70
      for (const line of stderr.split('\n')) {
        const t = line.trim()
        const iMatch = t.match(/I:\s+([-\d.]+)\s+LUFS/)
        if (iMatch) integratedLoudness = parseFloat(iMatch[1])
        const tpMatch = t.match(/Peak:\s+([-\d.]+)\s+dBFS/)
        if (tpMatch) truePeak = parseFloat(tpMatch[1])
      }
      if (integratedLoudness === -70) return reject(new Error('Failed to parse loudness'))
      resolve({ integratedLoudness, truePeak })
    })
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export async function startBackgroundLoudnessScan(db: DatabaseSync) {
  setTimeout(() => runLoudnessScan(db).catch((err) => console.error('background loudness scan failed', err)), 10_000)
}

async function runLoudnessScan(db: DatabaseSync) {

  // 1. Load build-time manifest to get track metadata (sourceUrl, index, etc.)
  let manifestReleases: ManifestRelease[] = []
  try {
    const raw = await readFile(MANIFEST_PATH, 'utf-8')
    const manifest = JSON.parse(raw)
    manifestReleases = manifest.releases || []
  } catch (err) {
    console.error('loudness scan: failed to read manifest', err)
  }

  // Build a map of manifest releases by slug for quick lookup
  const manifestBySlug = new Map<string, ManifestRelease>()
  for (const rel of manifestReleases) {
    if (rel.slug) manifestBySlug.set(rel.slug, rel)
  }

  // 2. Ensure ALL manifest releases exist in DB (insert missing ones)
  const inserted = await syncManifestToDb(db)
  if (inserted > 0) console.info(`loudness scan: inserted ${inserted} missing releases`)

  // 3. Get ALL releases from DB (not just manifest) and scan missing loudness
  const dbReleases = db.prepare('SELECT id, slug FROM releases').all() as Array<{ id: number; slug: string }>

  let scanned = 0
  let loaded = 0

  for (const dbRelease of dbReleases) {
    const manifestRel = manifestBySlug.get(dbRelease.slug)
    const manifestTracks = manifestRel?.tracks || []
    // Use sourceDirName from manifest (actual folder name) to avoid creating
    // phantom slug-named directories that the manifest generator would pick up.
    const dirName = manifestRel?.sourceDirName || dbRelease.slug

    // Get all tracks for this release from DB
    const dbTracks = db.prepare(
      'SELECT id, track_index, track_loudness, source_url FROM tracks WHERE release_id = ? ORDER BY track_index'
    ).all(dbRelease.id) as Array<{ id: number; track_index: number; track_loudness: number | null; source_url: string | null }>

    // Compute album loudness from existing track values
    const trackLoudnessValues: number[] = []
    for (const dbTrack of dbTracks) {
      if (dbTrack.track_loudness != null) {
        trackLoudnessValues.push(dbTrack.track_loudness)
      }
    }

    let changed = false

    for (const dbTrack of dbTracks) {
      if (dbTrack.track_loudness != null) continue  // already scanned

      // Find the manifest track metadata for sourceUrl
      const manifestTrack = manifestTracks.find((t) => t.index === dbTrack.track_index)
      const sourceUrl = manifestTrack?.sourceUrl || dbTrack.source_url

      // Try cached result from worker first — use the actual directory name
      const resultPath = path.join(ROOT, 'public', 'media', 'music', dirName, 'tracks', `.loudness-${dbTrack.track_index}.json`)
      try {
        const resultRaw = await readFile(resultPath, 'utf-8')
        const result: LoudnessResult = JSON.parse(resultRaw)
        if (typeof result.integratedLoudness === 'number' && Number.isFinite(result.integratedLoudness)) {
          db.prepare('UPDATE tracks SET track_loudness = ? WHERE id = ?').run(result.integratedLoudness, dbTrack.id)
          trackLoudnessValues.push(result.integratedLoudness)
          loaded++
          changed = true
          continue
        }
      } catch { /* no cached result */ }

      // Scan directly via ffmpeg
      if (!sourceUrl) continue
      const sourceRelative = String(sourceUrl).replace(/^\/+/, '')
      const sourceAbs = path.resolve(ROOT, 'public', sourceRelative)

      try {
        const result = await scanLoudness(sourceAbs)
        db.prepare('UPDATE tracks SET track_loudness = ? WHERE id = ?').run(result.integratedLoudness, dbTrack.id)
        trackLoudnessValues.push(result.integratedLoudness)
        scanned++
        changed = true

        // Only save cache if we have a real manifest directory (avoid creating phantom slug dirs)
        if (manifestRel) {
          await mkdir(path.dirname(resultPath), { recursive: true })
          await writeFile(resultPath, JSON.stringify(result))
        }

        // Be nice to the system — small delay between scans
        await sleep(500)
      } catch (err) {
        console.error(`loudness scan failed for ${dbRelease.slug} track ${dbTrack.track_index}:`, err)
      }
    }

    // Update album_loudness for all tracks in this release
    if (changed && trackLoudnessValues.length > 0) {
      const albumLoudness = trackLoudnessValues.reduce((a, b) => a + b, 0) / trackLoudnessValues.length
      db.prepare('UPDATE tracks SET album_loudness = ? WHERE release_id = ?').run(albumLoudness, dbRelease.id)
    }
  }

  if (scanned > 0 || loaded > 0) {
    console.info(`loudness scan: ${scanned} scanned, ${loaded} loaded from cache`)
  }
}
