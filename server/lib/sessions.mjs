import crypto from "node:crypto";
import { getOptionalEnv, getAppSecret, isProduction } from "./config.mjs";

export const USER_SESSION_COOKIE = "sid";
export const ADMIN_SESSION_COOKIE = "asid";

const USER_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const ADMIN_SESSION_TTL_MS = 1000 * 60 * 60 * 8; // 8 hours

function cookieBaseOptions() {
  const domain = getOptionalEnv("COOKIE_DOMAIN", "");

  return {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
    ...(domain ? { domain } : {})
  };
}

function makeToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(token) {
  const secret = getAppSecret();
  return crypto.createHmac("sha256", secret).update(token).digest("hex");
}

function nowMs() {
  return Date.now();
}

export function setUserSessionCookie(res, token) {
  res.cookie(USER_SESSION_COOKIE, token, { ...cookieBaseOptions(), maxAge: USER_SESSION_TTL_MS });
}

export function clearUserSessionCookie(res) {
  res.cookie(USER_SESSION_COOKIE, "", { ...cookieBaseOptions(), maxAge: 0 });
}

export function setAdminSessionCookie(res, token) {
  res.cookie(ADMIN_SESSION_COOKIE, token, { ...cookieBaseOptions(), maxAge: ADMIN_SESSION_TTL_MS });
}

export function clearAdminSessionCookie(res) {
  res.cookie(ADMIN_SESSION_COOKIE, "", { ...cookieBaseOptions(), maxAge: 0 });
}

export function createUserSession(db, { userId, ip = null, userAgent = null } = {}) {
  const token = makeToken();
  const tokenHash = hashToken(token);
  const createdAt = nowMs();
  const expiresAt = createdAt + USER_SESSION_TTL_MS;

  db.prepare(
    "INSERT INTO sessions (user_id, token_hash, created_at, expires_at, last_seen_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(userId, tokenHash, createdAt, expiresAt, createdAt, ip, userAgent);

  return { token, expiresAt };
}

export function createAdminSession(db, { ip = null, userAgent = null } = {}) {
  const token = makeToken();
  const tokenHash = hashToken(token);
  const createdAt = nowMs();
  const expiresAt = createdAt + ADMIN_SESSION_TTL_MS;

  db.prepare("INSERT INTO admin_sessions (token_hash, created_at, expires_at, last_seen_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)").run(
    tokenHash,
    createdAt,
    expiresAt,
    createdAt,
    ip,
    userAgent
  );

  return { token, expiresAt };
}

export function getUserBySessionToken(db, token) {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const now = nowMs();

  const row = db
    .prepare(
      `
      SELECT users.id as id, users.email as email, users.email_verified as email_verified
      FROM sessions
      INNER JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ?
        AND sessions.expires_at > ?
      LIMIT 1
    `
    )
    .get(tokenHash, now);

  if (!row) return null;

  db.prepare("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?").run(now, tokenHash);
  return {
    id: row.id,
    email: row.email,
    emailVerified: Boolean(row.email_verified)
  };
}

export function isAdminSessionValid(db, token) {
  if (!token) return false;
  const tokenHash = hashToken(token);
  const now = nowMs();

  const row = db.prepare("SELECT id FROM admin_sessions WHERE token_hash = ? AND expires_at > ? LIMIT 1").get(tokenHash, now);
  if (!row) return false;

  db.prepare("UPDATE admin_sessions SET last_seen_at = ? WHERE token_hash = ?").run(now, tokenHash);
  return true;
}

export function revokeUserSession(db, token) {
  if (!token) return;
  const tokenHash = hashToken(token);
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
}

export function revokeAdminSession(db, token) {
  if (!token) return;
  const tokenHash = hashToken(token);
  db.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").run(tokenHash);
}

export function cleanupExpiredSessions(db) {
  const now = nowMs();
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
  db.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").run(now);
}
