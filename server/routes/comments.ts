import { Elysia } from 'elysia'
import type { DatabaseSync } from '../lib/sqlite.js'
import { enforceSameOrigin } from '../lib/request-origin.js'
import { createSessionPlugin } from '../middleware/session.js'
import { createRateLimiter } from '../lib/rate-limit.js'
import { getRequestIp } from '../http/util.js'

const postRateLimit = createRateLimiter(6, 60_000)
const MAX_COMMENT_LENGTH = 2000

// Strip ASCII control characters except \t (0x09), \n (0x0a), \r (0x0d).
// Implemented without a regex literal (no-control-regex lint rule).
function stripControlChars(raw: string): string {
  let out = ''
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0
    const isControl = code <= 0x1f || code === 0x7f
    if (isControl && code !== 0x09 && code !== 0x0a && code !== 0x0d) continue
    out += ch
  }
  return out
}

type CommentRow = {
  id: number
  post_slug: string
  author_id: number
  parent_id: number | null
  content: string
  status: string
  created_at: number
  email: string | null
  banned: number
}

function sanitizeContent(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return stripControlChars(
    raw
      .replace(/<[^>]*>/g, '')
      .replace(/\r\n/g, '\n')
      .trim()
  ).slice(0, MAX_COMMENT_LENGTH)
}

function authorName(email: string | null): string {
  const local = (email ?? '').split('@')[0] || '???'
  return local
}

type PublicComment = {
  id: number
  parentId: number | null
  authorName: string
  content: string
  createdAt: number
  replies: PublicComment[]
}

function buildTree(rows: CommentRow[]): PublicComment[] {
  const byId = new Map<number, PublicComment>()
  const roots: PublicComment[] = []
  const ordered = [...rows].sort((a, b) => a.created_at - b.created_at || a.id - b.id)
  for (const row of ordered) {
    const node: PublicComment = {
      id: row.id,
      parentId: row.parent_id,
      authorName: authorName(row.email),
      content: row.content,
      createdAt: row.created_at,
      replies: [],
    }
    byId.set(row.id, node)
  }
  for (const node of byId.values()) {
    if (node.parentId !== null && byId.has(node.parentId)) {
      byId.get(node.parentId)!.replies.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

export function createCommentsRouter({ db }: { db: DatabaseSync }) {
  return new Elysia({ prefix: '/api/comments' })
    .use(createSessionPlugin({ db }))
    .get('/:post_slug', ({ params, set }) => {
      set.headers['cache-control'] = 'no-store'
      try {
        const postSlug = decodeURIComponent(params.post_slug)
        const rows = db.prepare(`
          SELECT c.id, c.post_slug, c.author_id, c.parent_id, c.content, c.status, c.created_at, u.email, u.banned
          FROM comments c
          LEFT JOIN users u ON u.id = c.author_id
          WHERE c.post_slug = ? AND c.status = 'approved'
        `).all(postSlug) as CommentRow[]
        return { ok: true, postSlug, comments: buildTree(rows) }
      } catch (err) {
        console.error('comments get failed', err)
        set.status = 500
        return { ok: false, error: 'Failed to load comments' }
      }
    })
    .post('/', ({ body, request, server, set, user }) => {
      const ip = getRequestIp({ request, server })
      if (!postRateLimit(`comment:${ip}`)) {
        set.status = 429
        return { error: 'Too many comments, slow down' }
      }
      if (!user) {
        set.status = 401
        return { error: 'Sign in to comment' }
      }
      try {
        const banned = db.prepare('SELECT id, banned FROM users WHERE id = ?').get(user.id) as { id: number; banned: number } | undefined
        if (banned?.banned) {
          set.status = 403
          return { error: 'Your account is banned' }
        }
      } catch {
        set.status = 500
        return { error: 'Unable to verify account' }
      }

      const b = (body || {}) as { postSlug?: unknown; parentId?: unknown; content?: unknown }
      const postSlug = typeof b.postSlug === 'string' ? b.postSlug.trim().slice(0, 200) : ''
      const content = sanitizeContent(b.content)
      const parentId = b.parentId === null || b.parentId === undefined ? null : Number(b.parentId)

      if (!postSlug || !content) {
        set.status = 400
        return { error: 'Missing post or comment content' }
      }
      if (parentId !== null && (!Number.isInteger(parentId) || parentId <= 0)) {
        set.status = 400
        return { error: 'Invalid parent comment' }
      }
      if (parentId !== null) {
        const parent = db.prepare('SELECT id, post_slug, status FROM comments WHERE id = ?').get(parentId) as { id: number; post_slug: string; status: string } | undefined
        if (!parent || parent.post_slug !== postSlug || parent.status === 'deleted') {
          set.status = 400
          return { error: 'Parent comment not found' }
        }
      }

      const createdAt = Date.now()
      const status = user.role === 'admin' ? 'approved' : 'pending'
      try {
        const result = db.prepare(
          'INSERT INTO comments (post_slug, author_id, parent_id, content, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(postSlug, user.id, parentId, content, status, createdAt)
        return {
          ok: true,
          comment: {
            id: Number(result.lastInsertRowid),
            parentId,
            authorName: authorName(user.email),
            content,
            createdAt,
            status,
          },
        }
      } catch (err) {
        console.error('comments create failed', err)
        set.status = 500
        return { error: 'Unable to post comment' }
      }
    }, { beforeHandle: enforceSameOrigin })
}