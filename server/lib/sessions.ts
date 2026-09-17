import crypto from 'node:crypto'
import type { DatabaseSync } from './sqlite.js'
import { serializeCookie } from './cookies.js'
import { getOptionalEnv, getAppSecret, isProduction } from './config.js'

export const USER_SESSION_COOKIE = 'sid'
export const ADMIN_SESSION_COOKIE = 'asid'
const USER_SESSION_TTL_MS = Number(getOptionalEnv('USER_SESSION_TTL_MS', String(30 * 24 * 60 * 60 * 1000)))
const ADMIN_SESSION_TTL_MS = Number(getOptionalEnv('ADMIN_SESSION_TTL_MS', String(8 * 60 * 60 * 1000)))

function cookieBaseOptions() {
  const domain = getOptionalEnv('COOKIE_DOMAIN', '')
  const siteHost = getOptionalEnv('SITE_HOST', '')
  const validDomain = domain && siteHost && domain === siteHost ? domain : ''
  return { httpOnly: true as const, sameSite: 'lax' as const, secure: isProduction(), path: '/', ...(validDomain ? { domain: validDomain } : {}) }
}

function makeToken() { return crypto.randomBytes(32).toString('base64url') }
function hashToken(token: string) { return crypto.createHmac('sha256', getAppSecret()).update(token).digest('hex') }
function nowMs() { return Date.now() }

export function setUserSessionCookie(token: string) { return serializeCookie(USER_SESSION_COOKIE, token, { ...cookieBaseOptions(), maxAge: USER_SESSION_TTL_MS }) }
export function clearUserSessionCookie() { return serializeCookie(USER_SESSION_COOKIE, '', { ...cookieBaseOptions(), maxAge: 0 }) }
export function setAdminSessionCookie(token: string) { return serializeCookie(ADMIN_SESSION_COOKIE, token, { ...cookieBaseOptions(), maxAge: ADMIN_SESSION_TTL_MS }) }
export function clearAdminSessionCookie() { return serializeCookie(ADMIN_SESSION_COOKIE, '', { ...cookieBaseOptions(), maxAge: 0 }) }

export function createUserSession(db: DatabaseSync, { userId, ip = null, userAgent = null }: { userId: number; ip?: string | null; userAgent?: string | null }) {
  const token = makeToken(); const tokenHash = hashToken(token); const createdAt = nowMs(); const expiresAt = createdAt + USER_SESSION_TTL_MS
  db.prepare('INSERT INTO sessions (user_id, token_hash, created_at, expires_at, last_seen_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)').run(userId, tokenHash, createdAt, expiresAt, createdAt, ip, userAgent)
  return { token, expiresAt }
}

export function createAdminSession(db: DatabaseSync, { ip = null, userAgent = null }: { ip?: string | null; userAgent?: string | null } = {}) {
  const token = makeToken(); const tokenHash = hashToken(token); const createdAt = nowMs(); const expiresAt = createdAt + ADMIN_SESSION_TTL_MS
  db.prepare('INSERT INTO admin_sessions (token_hash, created_at, expires_at, last_seen_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)').run(tokenHash, createdAt, expiresAt, createdAt, ip, userAgent)
  return { token, expiresAt }
}

export function getUserBySessionToken(db: DatabaseSync, token: string | null) {
  if (!token) return null
  const tokenHash = hashToken(token); const now = nowMs()
  const row = db.prepare(`SELECT users.id as id, users.email as email, users.email_verified as email_verified, users.role as role FROM sessions INNER JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ? LIMIT 1`).get(tokenHash, now) as { id: number; email: string; email_verified: number; role: string } | undefined
  if (!row) return null
  db.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?').run(now, now + USER_SESSION_TTL_MS, tokenHash)
  return { id: row.id, email: row.email, emailVerified: Boolean(row.email_verified), role: row.role }
}

export function isAdminSessionValid(db: DatabaseSync, token: string | null) {
  if (!token) return false
  const tokenHash = hashToken(token); const now = nowMs()
  const row = db.prepare('SELECT id FROM admin_sessions WHERE token_hash = ? AND expires_at > ? LIMIT 1').get(tokenHash, now)
  if (!row) return false
  db.prepare('UPDATE admin_sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?').run(now, now + ADMIN_SESSION_TTL_MS, tokenHash)
  return true
}

export function revokeUserSession(db: DatabaseSync, token: string | null) { if (!token) return; db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token)) }
export function revokeAdminSession(db: DatabaseSync, token: string | null) { if (!token) return; db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(hashToken(token)) }
export function cleanupExpiredSessions(db: DatabaseSync) { const now = nowMs(); db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now); db.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').run(now) }
