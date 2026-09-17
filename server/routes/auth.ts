import { Elysia } from 'elysia'
import type { DatabaseSync } from '../lib/sqlite.js'
import { enforceSameOrigin } from '../lib/request-origin.js'
import { getAppOrigin, isProduction } from '../lib/config.js'
import { getCookieByName } from '../lib/cookies.js'
import { hashPassword, verifyPassword } from '../lib/password.js'
import { USER_SESSION_COOKIE, clearUserSessionCookie, createUserSession, revokeUserSession, setUserSessionCookie } from '../lib/sessions.js'
import { createRateLimiter } from '../lib/rate-limit.js'
import { getRequestIp } from '../http/util.js'
import { createSessionPlugin } from '../middleware/session.js'

const checkRateLimit = createRateLimiter(10, 60_000)

type AuthBody = { email?: string; password?: string; lang?: string }

function normalizeEmail(raw: unknown) { return typeof raw === 'string' ? raw.trim().toLowerCase() : '' }
function isValidEmail(email: string) { return !!email && email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) }
function isValidPassword(password: unknown) { return typeof password === 'string' && password.length >= 8 && password.length <= 200 }
function pickLang(raw: unknown) { return raw === 'ru' || raw === 'en' ? raw : 'ru' }
function userPublic(row: { id: number; email: string; email_verified: number; role: string } | undefined | null) { return row ? { id: row.id, email: row.email, emailVerified: Boolean(row.email_verified), role: row.role } : null }

export function createAuthRouter({ db }: { db: DatabaseSync }) {
  return new Elysia({ prefix: '/api/auth' })
    .use(createSessionPlugin({ db }))
    .get('/me', ({ user, set }) => {
      set.headers['cache-control'] = 'no-store'
      return { user: user ?? null }
    })
    .get('/session', ({ user, set }) => {
      set.headers['cache-control'] = 'no-store'
      if (!user) return { authenticated: false, user: null }
      return { authenticated: true, user }
    })
    .post('/logout', ({ request, set }) => {
      const sid = getCookieByName(request.headers.get('cookie'), USER_SESSION_COOKIE)
      if (sid) revokeUserSession(db, sid)
      set.headers['set-cookie'] = clearUserSessionCookie()
      return { ok: true }
    }, { beforeHandle: enforceSameOrigin })
    .post('/register', ({ body, request, server, set }) => {
      const ip = getRequestIp({ request, server })
      if (!checkRateLimit(`register:${ip}`)) {
        set.status = 429
        return { error: 'Too many requests' }
      }

      const email = normalizeEmail((body as AuthBody | undefined)?.email)
      const password = (body as AuthBody | undefined)?.password
      const lang = pickLang((body as AuthBody | undefined)?.lang)
      if (!isValidEmail(email)) {
        set.status = 400
        return { error: lang === 'ru' ? 'Некорректный email' : 'Invalid email' }
      }
      if (!isValidPassword(password)) {
        set.status = 400
        return { error: lang === 'ru' ? 'Некорректный пароль' : 'Invalid password' }
      }

      const createdAt = Date.now()
      const passwordHash = hashPassword(password!)
      let userId = 0

      let committed = false
      try {
        db.exec('BEGIN IMMEDIATE;')
        const existing = db.prepare('SELECT id, email_verified FROM users WHERE email = ? LIMIT 1').get(email) as { id: number; email_verified: number } | undefined
        if (existing?.email_verified) {
          db.exec('ROLLBACK;')
          committed = true
          set.status = 409
          return { error: lang === 'ru' ? 'Аккаунт уже существует, попробуйте вход' : 'Account already exists, try login' }
        }

        if (existing?.id) {
          userId = existing.id
          db.prepare('UPDATE users SET password_hash = ?, email_verified = 1, updated_at = ? WHERE id = ?').run(passwordHash, createdAt, userId)
        } else {
          const result = db.prepare('INSERT INTO users (email, password_hash, email_verified, created_at, updated_at) VALUES (?, ?, 1, ?, ?)').run(email, passwordHash, createdAt, createdAt)
          userId = Number(result.lastInsertRowid)
        }

        db.exec('COMMIT;')
        committed = true
        const user = db.prepare('SELECT id, email, email_verified, role FROM users WHERE id = ? LIMIT 1').get(userId) as { id: number; email: string; email_verified: number; role: string } | undefined
        const userAgent = request.headers.get('user-agent') || ''
        const session = createUserSession(db, { userId, ip, userAgent })
        set.headers['set-cookie'] = setUserSessionCookie(session.token)
        return { ok: true, user: userPublic(user) }
      } catch (error) {
        console.error('register failed', error)
        set.status = 500
        return { error: 'Unable to register' }
      } finally {
        if (!committed) { try { db.exec('ROLLBACK;') } catch { /* no transaction to roll back */ } }
      }
    }, { beforeHandle: enforceSameOrigin })
    .post('/login', ({ body, request, server, set }) => {
      const ip = getRequestIp({ request, server })
      if (!checkRateLimit(`login:${ip}`)) {
        set.status = 429
        return { error: 'Too many requests' }
      }

      const email = normalizeEmail((body as AuthBody | undefined)?.email)
      const password = (body as AuthBody | undefined)?.password
      const lang = pickLang((body as AuthBody | undefined)?.lang)
      if (!isValidEmail(email)) {
        set.status = 400
        return { error: lang === 'ru' ? 'Некорректный email' : 'Invalid email' }
      }
      if (typeof password !== 'string') {
        set.status = 400
        return { error: lang === 'ru' ? 'Некорректный пароль' : 'Invalid password' }
      }

      const user = db.prepare('SELECT id, email, email_verified, role, password_hash FROM users WHERE email = ? LIMIT 1').get(email) as { id: number; email: string; email_verified: number; role: string; password_hash: string } | undefined
      const DUMMY_HASH = 'scrypt$16384$8$1$00000000000000000000000000000000$000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'
      const storedHash = user?.password_hash ?? DUMMY_HASH
      if (!verifyPassword(password, storedHash) || !user) {
        set.status = 401
        return { error: lang === 'ru' ? 'Неверный email или пароль' : 'Invalid email or password' }
      }

      const userAgent = request.headers.get('user-agent') || ''
      const session = createUserSession(db, { userId: user.id, ip, userAgent })
      set.headers['set-cookie'] = setUserSessionCookie(session.token)
      return { ok: true, user: userPublic(user) }
    }, { beforeHandle: enforceSameOrigin })
    .get('/config', () => {
      return { ok: true, origin: getAppOrigin(), requireEmailVerification: false, enforceSecureCookies: isProduction() }
    })
}
