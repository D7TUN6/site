import crypto from "node:crypto";

const SCRYPT_KEYLEN = 64;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

function timingSafeEqual(a, b) {
  const bufA = Buffer.isBuffer(a) ? a : Buffer.from(String(a));
  const bufB = Buffer.isBuffer(b) ? b : Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function hashPassword(password) {
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024
  });

  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export function verifyPassword(password, stored) {
  if (typeof password !== "string" || typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 6) return false;
  if (parts[0] !== "scrypt") return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const saltB64 = parts[4];
  const hashB64 = parts[5];

  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

  let salt;
  let expected;
  try {
    salt = Buffer.from(saltB64, "base64");
    expected = Buffer.from(hashB64, "base64");
  } catch {
    return false;
  }

  if (!salt?.length || !expected?.length) return false;

  const derived = crypto.scryptSync(password, salt, expected.length, {
    N,
    r,
    p,
    maxmem: 64 * 1024 * 1024
  });

  return timingSafeEqual(derived, expected);
}
