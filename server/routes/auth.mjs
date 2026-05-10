import crypto from "node:crypto";
import express from "express";
import { enforceSameOrigin } from "../lib/request-origin.mjs";
import { getAppOrigin, getAppSecret, isProduction } from "../lib/config.mjs";
import { getCookie } from "../lib/cookies.mjs";
import { buildVerificationEmail } from "../lib/mailer.mjs";
import { hashPassword, verifyPassword } from "../lib/password.mjs";
import { USER_SESSION_COOKIE, clearUserSessionCookie, createUserSession, revokeUserSession, setUserSessionCookie } from "../lib/sessions.mjs";

const CODE_TTL_MS = 1000 * 60 * 10; // 10 minutes
const CODE_MAX_ATTEMPTS = 10;

function nowMs() {
  return Date.now();
}

function normalizeEmail(raw) {
  if (typeof raw !== "string") return "";
  return raw.trim().toLowerCase();
}

function isValidEmail(email) {
  if (!email || email.length > 320) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPassword(password) {
  return typeof password === "string" && password.length >= 8 && password.length <= 200;
}

function makeCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashCode(email, code) {
  const secret = getAppSecret();
  return crypto.createHmac("sha256", secret).update(`verify:${email}:${code}`).digest("hex");
}

function pickLang(raw) {
  if (raw === "ru" || raw === "en") return raw;
  return "ru";
}

function userPublic(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    emailVerified: Boolean(row.email_verified)
  };
}

export function createAuthRouter({ db, mailer }) {
  const router = express.Router();

  router.get("/me", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!req.user) {
      return res.status(200).json({ user: null });
    }
    return res.status(200).json({ user: req.user });
  });

  router.post("/logout", enforceSameOrigin, (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const sid = getCookie(req, USER_SESSION_COOKIE);
    if (sid) {
      revokeUserSession(db, sid);
    }
    clearUserSessionCookie(res);
    return res.status(200).json({ ok: true });
  });

  router.post("/register", enforceSameOrigin, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;
    const lang = pickLang(req.body?.lang);

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: lang === "ru" ? "Некорректный email" : "Invalid email" });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({ error: lang === "ru" ? "Некорректный пароль" : "Invalid password" });
    }

    const createdAt = nowMs();
    const passwordHash = hashPassword(password);

    let userId;

    db.exec("BEGIN IMMEDIATE;");
    try {
      const existing = db.prepare("SELECT id, email_verified FROM users WHERE email = ? LIMIT 1").get(email);
      if (existing?.email_verified) {
        db.exec("ROLLBACK;");
        return res.status(409).json({ error: lang === "ru" ? "Аккаунт уже существует, попробуйте вход" : "Account already exists, try login" });
      }

      if (existing?.id) {
        userId = existing.id;
        db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(passwordHash, createdAt, userId);
        db.prepare("DELETE FROM email_verification_codes WHERE user_id = ?").run(userId);
      } else {
        const result = db
          .prepare("INSERT INTO users (email, password_hash, email_verified, created_at, updated_at) VALUES (?, ?, 0, ?, ?)")
          .run(email, passwordHash, createdAt, createdAt);
        userId = Number(result.lastInsertRowid);
      }

      const code = makeCode();
      const codeHash = hashCode(email, code);
      const expiresAt = createdAt + CODE_TTL_MS;

      db.prepare(
        "INSERT INTO email_verification_codes (user_id, code_hash, expires_at, attempts, created_at) VALUES (?, ?, ?, 0, ?)"
      ).run(userId, codeHash, expiresAt, createdAt);

      db.exec("COMMIT;");

      const origin = getAppOrigin();
      const { subject, text, html } = buildVerificationEmail({ origin, code, lang });
      await mailer.sendMail({ to: email, subject, text, html });

      return res.status(200).json({ ok: true });
    } catch (error) {
      try {
        db.exec("ROLLBACK;");
      } catch {
        // ignore
      }
      console.error("register failed", error);
      return res.status(500).json({ error: "Unable to register" });
    }
  });

  router.post("/verify", enforceSameOrigin, (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const email = normalizeEmail(req.body?.email);
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    const lang = pickLang(req.body?.lang);

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: lang === "ru" ? "Некорректный email" : "Invalid email" });
    }
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: lang === "ru" ? "Некорректный код" : "Invalid code" });
    }

    const now = nowMs();

    db.exec("BEGIN IMMEDIATE;");
    try {
      const user = db.prepare("SELECT id, email, email_verified FROM users WHERE email = ? LIMIT 1").get(email);
      if (!user) {
        db.exec("ROLLBACK;");
        return res.status(404).json({ error: lang === "ru" ? "Пользователь не найден" : "User not found" });
      }

      if (user.email_verified) {
        db.exec("COMMIT;");
        const session = createUserSession(db, {
          userId: user.id,
          ip: req.ip,
          userAgent: String(req.get("user-agent") || "")
        });
        setUserSessionCookie(res, session.token);
        return res.status(200).json({ ok: true, user: userPublic(user) });
      }

      const codeRow = db
        .prepare(
          `
          SELECT id, code_hash, expires_at, attempts
          FROM email_verification_codes
          WHERE user_id = ?
          ORDER BY id DESC
          LIMIT 1
        `
        )
        .get(user.id);

      if (!codeRow) {
        db.exec("ROLLBACK;");
        return res.status(400).json({ error: lang === "ru" ? "Код не найден, запросите новый" : "Code not found, request a new one" });
      }

      if (codeRow.expires_at <= now) {
        db.prepare("DELETE FROM email_verification_codes WHERE id = ?").run(codeRow.id);
        db.exec("COMMIT;");
        return res.status(400).json({ error: lang === "ru" ? "Код истёк, запросите новый" : "Code expired, request a new one" });
      }

      if (codeRow.attempts >= CODE_MAX_ATTEMPTS) {
        db.exec("COMMIT;");
        return res.status(429).json({ error: lang === "ru" ? "Слишком много попыток, запросите новый код" : "Too many attempts, request a new code" });
      }

      const expected = String(codeRow.code_hash);
      const actual = hashCode(email, code);

      if (expected !== actual) {
        db.prepare("UPDATE email_verification_codes SET attempts = attempts + 1 WHERE id = ?").run(codeRow.id);
        db.exec("COMMIT;");
        return res.status(400).json({ error: lang === "ru" ? "Неверный код" : "Invalid code" });
      }

      db.prepare("UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?").run(now, user.id);
      db.prepare("DELETE FROM email_verification_codes WHERE user_id = ?").run(user.id);
      db.exec("COMMIT;");

      const session = createUserSession(db, {
        userId: user.id,
        ip: req.ip,
        userAgent: String(req.get("user-agent") || "")
      });
      setUserSessionCookie(res, session.token);

      return res.status(200).json({ ok: true, user: { id: user.id, email: user.email, emailVerified: true } });
    } catch (error) {
      try {
        db.exec("ROLLBACK;");
      } catch {
        // ignore
      }
      console.error("verify failed", error);
      return res.status(500).json({ error: "Unable to verify" });
    }
  });

  router.post("/login", enforceSameOrigin, (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;
    const lang = pickLang(req.body?.lang);

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: lang === "ru" ? "Некорректный email" : "Invalid email" });
    }
    if (typeof password !== "string") {
      return res.status(400).json({ error: lang === "ru" ? "Некорректный пароль" : "Invalid password" });
    }

    const user = db.prepare("SELECT id, email, email_verified, password_hash FROM users WHERE email = ? LIMIT 1").get(email);
    if (!user) {
      return res.status(401).json({ error: lang === "ru" ? "Неверный email или пароль" : "Invalid email or password" });
    }

    if (!verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: lang === "ru" ? "Неверный email или пароль" : "Invalid email or password" });
    }

    if (!user.email_verified) {
      return res.status(403).json({ error: lang === "ru" ? "Email не подтверждён" : "Email is not verified" });
    }

    const session = createUserSession(db, {
      userId: user.id,
      ip: req.ip,
      userAgent: String(req.get("user-agent") || "")
    });
    setUserSessionCookie(res, session.token);

    return res.status(200).json({ ok: true, user: userPublic(user) });
  });

  router.post("/resend", enforceSameOrigin, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const email = normalizeEmail(req.body?.email);
    const lang = pickLang(req.body?.lang);

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: lang === "ru" ? "Некорректный email" : "Invalid email" });
    }

    const user = db.prepare("SELECT id, email, email_verified FROM users WHERE email = ? LIMIT 1").get(email);
    if (!user) {
      return res.status(200).json({ ok: true });
    }
    if (user.email_verified) {
      return res.status(200).json({ ok: true });
    }

    const createdAt = nowMs();
    const code = makeCode();
    const codeHash = hashCode(email, code);
    const expiresAt = createdAt + CODE_TTL_MS;

    db.exec("BEGIN IMMEDIATE;");
    try {
      db.prepare("DELETE FROM email_verification_codes WHERE user_id = ?").run(user.id);
      db.prepare(
        "INSERT INTO email_verification_codes (user_id, code_hash, expires_at, attempts, created_at) VALUES (?, ?, ?, 0, ?)"
      ).run(user.id, codeHash, expiresAt, createdAt);
      db.exec("COMMIT;");
    } catch (error) {
      try {
        db.exec("ROLLBACK;");
      } catch {
        // ignore
      }
      console.error("resend failed", error);
      return res.status(500).json({ error: "Unable to resend code" });
    }

    const origin = getAppOrigin();
    const { subject, text, html } = buildVerificationEmail({ origin, code, lang });
    await mailer.sendMail({ to: email, subject, text, html });

    return res.status(200).json({ ok: true });
  });

  router.get("/config", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const origin = getAppOrigin();
    return res.status(200).json({
      ok: true,
      origin,
      requireEmailVerification: true,
      enforceSecureCookies: isProduction()
    });
  });

  return router;
}
