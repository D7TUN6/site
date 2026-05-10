import express from 'express'
import type { DatabaseSync } from 'node:sqlite'
import { enforceSameOrigin } from '../lib/request-origin.js'
import { getAppOrigin, isProduction } from '../lib/config.js'
import { getCookie } from '../lib/cookies.js'
import { hashPassword, verifyPassword } from '../lib/password.js'
import { USER_SESSION_COOKIE, clearUserSessionCookie, createUserSession, revokeUserSession, setUserSessionCookie } from '../lib/sessions.js'

function normalizeEmail(raw: unknown) { return typeof raw === 'string' ? raw.trim().toLowerCase() : '' }
function isValidEmail(email: string) { return !!email && email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) }
function isValidPassword(password: unknown) { return typeof password === 'string' && password.length >= 8 && password.length <= 200 }
function pickLang(raw: unknown) { return raw === 'ru' || raw === 'en' ? raw : 'ru' }
function userPublic(row: { id: number; email: string; email_verified: number } | undefined) { return row ? { id: row.id, email: row.email, emailVerified: Boolean(row.email_verified) } : null }

export function createAuthRouter({ db }: { db: DatabaseSync }) {
  const router = express.Router()

  router.get('/me', (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    if (!req.user) return res.status(200).json({ user: null })
    return res.status(200).json({ user: req.user })
  })

  router.get('/session', (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    if (!req.user) return res.status(200).json({ authenticated: false, user: null })
    return res.status(200).json({ authenticated: true, user: req.user })
  })

  router.post('/logout', enforceSameOrigin, (req, res) => {
    const sid = getCookie(req, USER_SESSION_COOKIE)
    if (sid) revokeUserSession(db, sid)
    clearUserSessionCookie(res)
    return res.status(200).json({ ok: true })
  })

  router.post('/register', enforceSameOrigin, (req, res) => {
    const email = normalizeEmail(req.body?.email)
    const password = req.body?.password
    const lang = pickLang(req.body?.lang)
    if (!isValidEmail(email)) return res.status(400).json({ error: lang === 'ru' ? 'Некорректный email' : 'Invalid email' })
    if (!isValidPassword(password)) return res.status(400).json({ error: lang === 'ru' ? 'Некорректный пароль' : 'Invalid password' })

    const createdAt = Date.now()
    const passwordHash = hashPassword(password)
    let userId = 0

    db.exec('BEGIN IMMEDIATE;')
    try {
      const existing = db.prepare('SELECT id, email_verified FROM users WHERE email = ? LIMIT 1').get(email) as { id: number; email_verified: number } | undefined
      if (existing?.email_verified) {
        db.exec('ROLLBACK;')
        return res.status(409).json({ error: lang === 'ru' ? 'Аккаунт уже существует, попробуйте вход' : 'Account already exists, try login' })
      }

      if (existing?.id) {
        userId = existing.id
        db.prepare('UPDATE users SET password_hash = ?, email_verified = 1, updated_at = ? WHERE id = ?').run(passwordHash, createdAt, userId)
      } else {
        const result = db.prepare('INSERT INTO users (email, password_hash, email_verified, created_at, updated_at) VALUES (?, ?, 1, ?, ?)').run(email, passwordHash, createdAt, createdAt)
        userId = Number(result.lastInsertRowid)
      }

      db.exec('COMMIT;')
      const user = db.prepare('SELECT id, email, email_verified FROM users WHERE id = ? LIMIT 1').get(userId) as { id: number; email: string; email_verified: number } | undefined
      const session = createUserSession(db, { userId, ip: req.ip, userAgent: String(req.get('user-agent') || '') })
      setUserSessionCookie(res, session.token)
      return res.status(200).json({ ok: true, user: userPublic(user) })
    } catch (error) {
      try {
        db.exec('ROLLBACK;')
      } catch (rollbackError) {
        void rollbackError
      }
      console.error('register failed', error)
      return res.status(500).json({ error: 'Unable to register' })
    }
  })

  router.post('/login', enforceSameOrigin, (req, res) => {
    const email = normalizeEmail(req.body?.email)
    const password = req.body?.password
    const lang = pickLang(req.body?.lang)
    if (!isValidEmail(email)) return res.status(400).json({ error: lang === 'ru' ? 'Некорректный email' : 'Invalid email' })
    if (typeof password !== 'string') return res.status(400).json({ error: lang === 'ru' ? 'Некорректный пароль' : 'Invalid password' })

    const user = db.prepare('SELECT id, email, email_verified, password_hash FROM users WHERE email = ? LIMIT 1').get(email) as { id: number; email: string; email_verified: number; password_hash: string } | undefined
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: lang === 'ru' ? 'Неверный email или пароль' : 'Invalid email or password' })
    }

    const session = createUserSession(db, { userId: user.id, ip: req.ip, userAgent: String(req.get('user-agent') || '') })
    setUserSessionCookie(res, session.token)
    return res.status(200).json({ ok: true, user: userPublic(user) })
  })

  router.get('/config', (_req, res) => {
    return res.status(200).json({ ok: true, origin: getAppOrigin(), requireEmailVerification: false, enforceSecureCookies: isProduction() })
  })

  return router
}
