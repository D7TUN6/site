import crypto from 'node:crypto'
import { Elysia } from 'elysia'
import type { DatabaseSync } from '../../lib/sqlite.js'
import { enforceSameOrigin } from '../../lib/request-origin.js'
import { requireEnv } from '../../lib/config.js'
import { getCookieByName } from '../../lib/cookies.js'
import { ADMIN_SESSION_COOKIE, clearAdminSessionCookie, createAdminSession, isAdminSessionValid, revokeAdminSession, setAdminSessionCookie } from '../../lib/sessions.js'
import { checkLoginRateLimit, normalizeEmail, safeEqual } from './shared.js'
import { getRequestIp } from '../../http/util.js'

const SCRYPT_N = Number(process.env.SCRYPT_N) || 16384
const SCRYPT_R = Number(process.env.SCRYPT_R) || 8
const SCRYPT_P = Number(process.env.SCRYPT_P) || 1
const KEYLEN = 64

function hashPassword(password: string, salt?: string): Promise<{ hash: string; salt: string }> {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex')
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, actualSalt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }, (err, derivedKey) => {
      if (err) return reject(err)
      resolve({ hash: derivedKey.toString('hex'), salt: actualSalt })
    })
  })
}

let cachedAdminEmailHash: { email: string; hash: string; salt: string } | null = null

async function getAdminEmailHash(): Promise<{ email: string; hash: string; salt: string }> {
  if (cachedAdminEmailHash) return cachedAdminEmailHash
  const email = normalizeEmail(requireEnv('ADMIN_EMAIL'))
  const adminPassword = requireEnv('ADMIN_PASSWORD')
  // Check if the password looks like it's already a scrypt hash (hex string of length >= 128)
  if (/^[0-9a-f]{128,}$/i.test(adminPassword)) {
    // Already hashed — extract salt from the end (last 32 hex chars = 16 bytes)
    const salt = adminPassword.slice(-32)
    cachedAdminEmailHash = { email, hash: adminPassword, salt }
  } else {
    const { hash, salt } = await hashPassword(adminPassword)
    cachedAdminEmailHash = { email, hash: hash + salt, salt }
  }
  return cachedAdminEmailHash
}

export function createAdminAuthRouter({ db }: { db: DatabaseSync }) {
  return new Elysia({ prefix: '/api/admin/auth' })
    .get('/me', ({ request }) => {
      const asid = getCookieByName(request.headers.get('cookie'), ADMIN_SESSION_COOKIE)
      let isAdmin = false
      try { isAdmin = asid ? isAdminSessionValid(db, asid) : false } catch { isAdmin = false }
      return {
        ok: true,
        isAdmin,
        email: isAdmin ? normalizeEmail(requireEnv('ADMIN_EMAIL')) : null,
      }
    })
    .post('/logout', ({ request, set }) => {
      const token = getCookieByName(request.headers.get('cookie'), ADMIN_SESSION_COOKIE)
      if (token) revokeAdminSession(db, token)
      set.headers['set-cookie'] = clearAdminSessionCookie()
      return { ok: true }
    }, { beforeHandle: enforceSameOrigin })
    .post('/login', async ({ request, body, set, server }) => {
      try {
        const ip = getRequestIp({ request, server })
        if (!checkLoginRateLimit(`admin-login:${ip}`)) {
          set.status = 429
          return { error: 'Too many requests' }
        }
        const b = (body || {}) as Record<string, unknown>
        const email = normalizeEmail(b.email)
        const password = typeof b.password === 'string' ? b.password : ''
        if (!email || !password) {
          set.status = 400
          return { error: 'Invalid credentials' }
        }
        const admin = await getAdminEmailHash()
        if (!safeEqual(email, admin.email)) {
          set.status = 401
          return { error: 'Invalid credentials' }
        }
        // Compare using constant-time comparison of scrypt hashes
        const { hash: incomingHash } = await hashPassword(password, admin.salt)
        const fullStoredHash = admin.hash
        const fullIncomingHash = incomingHash + admin.salt
        if (!safeEqual(fullIncomingHash, fullStoredHash)) {
          set.status = 401
          return { error: 'Invalid credentials' }
        }
        const session = createAdminSession(db, { ip, userAgent: String(request.headers.get('user-agent') || '') })
        set.headers['set-cookie'] = setAdminSessionCookie(session.token)
        return { ok: true }
      } catch {
        set.status = 500
        return { error: 'Invalid credentials' }
      }
    }, { beforeHandle: enforceSameOrigin })
}
