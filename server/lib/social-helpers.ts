import { randomUUID } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { DatabaseSync } from './sqlite.js'
import { getCookieByName, serializeCookie } from './cookies.js'
import { exists } from './media-convert.js'
import { slugify } from './slugify.js'
import { isProduction } from './config.js'

const MUSIC_ROOT = path.resolve(process.cwd(), 'public', 'media', 'music')
const MANIFEST_PATH = path.resolve(process.cwd(), 'src', 'generated', 'release-manifest.json')

const GTE_RE = /^(.*)__gte$/
const LIKE_RE = /^(.*)__like$/

export interface LikeRow {
  id: number
}

export function buildWhereClause(filters: Record<string, unknown>): { where: string; params: unknown[] } {
  const conditions: string[] = []
  const params: unknown[] = []

  for (const [rawKey, val] of Object.entries(filters)) {
    if (val === null || val === undefined) continue
    let op = '='
    let key = rawKey
    const gteMatch = rawKey.match(GTE_RE)
    if (gteMatch) { key = gteMatch[1]; op = '>=' }
    const likeMatch = key.match(LIKE_RE)
    if (likeMatch) { key = likeMatch[1]; op = 'LIKE' }
    const SAFE_COLUMNS = new Set(['id', 'user_id', 'target_type', 'target_slug', 'created_at', 'session_id', 'track_index', 'category', 'release_slug', 'likes', 'plays', 'views'])
    if (!SAFE_COLUMNS.has(key)) continue
    conditions.push(`${key} ${op} ?`)
    params.push(val)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  return { where, params }
}

async function findAlbumDir(slug: string): Promise<string | null> {
  try {
    const raw = await readFile(MANIFEST_PATH, 'utf8')
    const parsed = JSON.parse(raw) as { releases?: Array<{ slug: string; sourceDirName?: string }> }
    const release = parsed.releases?.find((r) => r.slug === slug)
    if (release) return release.sourceDirName ?? release.slug
  } catch { /* fall through */ }
  try {
    const entries = await readdir(MUSIC_ROOT)
    for (const entry of entries) {
      if (slugify(entry) === slug) return entry
    }
  } catch { /* ignore */ }
  return null
}

export async function socialMetricsHidden(slug: string): Promise<boolean> {
  const albumDir = await findAlbumDir(slug)
  if (!albumDir) return false
  const dir = path.join(MUSIC_ROOT, albumDir)
  const filePath = path.join(dir, '.social-metrics-hidden')
  if (!(await exists(filePath))) return false
  const content = await readFile(filePath, 'utf8').catch(() => 'false')
  return content.trim() === 'true'
}

export async function toggleSocialMetricsHidden(slug: string, hidden: boolean): Promise<boolean> {
  const albumDir = await findAlbumDir(slug)
  if (!albumDir) return false
  const filePath = path.join(MUSIC_ROOT, albumDir, '.social-metrics-hidden')
  await writeFile(filePath, hidden ? 'true' : 'false', 'utf8')
  return true
}

export async function getUserLike(
  db: DatabaseSync,
  userId: number,
  targetType: string,
  targetSlug: string,
  trackIndex: number | null
): Promise<LikeRow | undefined> {
  if (trackIndex === null) {
    return db.prepare(
      'SELECT id FROM likes WHERE user_id = ? AND target_type = ? AND target_slug = ? AND track_index IS NULL LIMIT 1'
    ).get(userId, targetType, targetSlug) as LikeRow | undefined
  }
  return db.prepare(
    'SELECT id FROM likes WHERE user_id = ? AND target_type = ? AND target_slug = ? AND track_index = ? LIMIT 1'
  ).get(userId, targetType, targetSlug, trackIndex) as LikeRow | undefined
}

export async function getUserLikedTracks(
  db: DatabaseSync,
  userId: number,
  targetSlug: string
): Promise<number[]> {
  const rows = db.prepare(
    'SELECT track_index FROM likes WHERE user_id = ? AND target_slug = ? AND target_type = ? AND track_index IS NOT NULL'
  ).all(userId, targetSlug, 'track') as Array<{ track_index: number }>
  return rows.map(r => r.track_index)
}

export async function getSessionLike(
  db: DatabaseSync,
  sessionId: string,
  targetType: string,
  targetSlug: string,
  trackIndex: number | null
): Promise<LikeRow | undefined> {
  if (trackIndex === null) {
    return db.prepare(
      'SELECT id FROM likes WHERE session_id = ? AND user_id IS NULL AND target_type = ? AND target_slug = ? AND track_index IS NULL LIMIT 1'
    ).get(sessionId, targetType, targetSlug) as LikeRow | undefined
  }
  return db.prepare(
    'SELECT id FROM likes WHERE session_id = ? AND user_id IS NULL AND target_type = ? AND target_slug = ? AND track_index = ? LIMIT 1'
  ).get(sessionId, targetType, targetSlug, trackIndex) as LikeRow | undefined
}

export async function getSessionLikedTracks(
  db: DatabaseSync,
  sessionId: string,
  targetSlug: string
): Promise<number[]> {
  const rows = db.prepare(
    'SELECT track_index FROM likes WHERE session_id = ? AND user_id IS NULL AND target_slug = ? AND target_type = ? AND track_index IS NOT NULL'
  ).all(sessionId, targetSlug, 'track') as Array<{ track_index: number }>
  return rows.map(r => r.track_index)
}

export function getTrackLikesCount(
  db: DatabaseSync,
  slug: string
): { albumLikes: number; trackLikes: Record<number, number> } {
  const albumLikes = db.prepare(
    'SELECT COUNT(*) as count FROM likes WHERE target_slug = ? AND target_type = ? AND track_index IS NULL'
  ).get(slug, 'album') as { count: number }
  const trackRows = db.prepare(
    'SELECT track_index, COUNT(*) as count FROM likes WHERE target_slug = ? AND target_type = ? AND track_index IS NOT NULL GROUP BY track_index'
  ).all(slug, 'track') as Array<{ track_index: number; count: number }>
  const trackLikes: Record<number, number> = {}
  for (const row of trackRows) trackLikes[row.track_index] = row.count
  return { albumLikes: albumLikes.count, trackLikes }
}

export function insertLike(
  db: DatabaseSync,
  userId: number | null,
  sessionId: string,
  targetType: string,
  targetSlug: string,
  trackIndex: number | null
): void {
  db.prepare(
    'INSERT INTO likes (user_id, session_id, target_type, target_slug, track_index, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, sessionId, targetType, targetSlug, trackIndex, Date.now())
}

export function deleteLike(db: DatabaseSync, id: number): void {
  db.prepare('DELETE FROM likes WHERE id = ?').run(id)
}

export function resolveUserAndSession(ctx: {
  request: Request
  set: { headers: Record<string, unknown> }
  user?: { id: number } | null
}): { userId: number | null; sessionId: string } {
  const { request, set, user } = ctx
  if (user) {
    return { userId: user.id, sessionId: '' }
  }
  let sessionId = getCookieByName(request.headers.get('cookie'), 'likes_sid')
  if (!sessionId) {
    sessionId = randomUUID()
    set.headers['set-cookie'] = serializeCookie('likes_sid', sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction(),
      path: '/',
      maxAge: 365 * 24 * 60 * 60 * 1000,
    })
  }
  return { userId: null, sessionId }
}
