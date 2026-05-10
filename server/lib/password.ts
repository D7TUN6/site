import crypto from 'node:crypto'

const SCRYPT_KEYLEN = 64
const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1

export function hashPassword(password: string) {
  if (typeof password !== 'string' || password.length < 8) throw new Error('Password too short')
  const salt = crypto.randomBytes(16)
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P })
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${derived.toString('hex')}`
}

export function verifyPassword(password: string, stored: string) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const n = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  const salt = Buffer.from(parts[4], 'hex')
  const expected = Buffer.from(parts[5], 'hex')
  const derived = crypto.scryptSync(password, salt, expected.length, { N: n, r, p })
  return crypto.timingSafeEqual(expected, derived)
}
