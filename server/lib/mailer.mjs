import nodemailer from "nodemailer";
import { getOptionalEnv, isProduction } from "./config.mjs";

function parseBoolean(value) {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function createMailer() {
  const host = getOptionalEnv("SMTP_HOST", "");
  const portRaw = getOptionalEnv("SMTP_PORT", "");
  const user = getOptionalEnv("SMTP_USER", "");
  const pass = getOptionalEnv("SMTP_PASS", "");
  const from = getOptionalEnv("SMTP_FROM", "");
  const secure = parseBoolean(getOptionalEnv("SMTP_SECURE", ""));

  const port = portRaw ? Number(portRaw) : secure ? 465 : 587;

  const isConfigured = Boolean(host && port && from);
  if (!isConfigured && isProduction()) {
    throw new Error("SMTP is not configured (set SMTP_HOST/SMTP_PORT/SMTP_FROM and auth if needed)");
  }

  if (!isConfigured) {
    return {
      isConfigured: false,
      async sendMail(payload) {
        console.log("[mailer] SMTP not configured, skipping send:", payload?.subject, payload?.to);
      }
    };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined
  });

  return {
    isConfigured: true,
    async sendMail({ to, subject, text, html }) {
      try {
        await transporter.sendMail({
          from,
          to,
          subject,
          text,
          html
        });
      } catch (error) {
        console.error(`[mailer] sendMail failed to=${to} subject="${subject}":`, error.message);
        console.error(`[mailer] SMTP config: host=${host} port=${port} secure=${secure} user=${user || "(none)"}`);
        throw error;
      }
    }
  };
}

export function buildVerificationEmail({ origin, code, lang }) {
  const isRu = lang === "ru";
  const subject = isRu ? `D7TUN6.site — код подтверждения: ${code}` : `D7TUN6.site — verification code: ${code}`;
  const loginUrl = origin ? `${origin}/${isRu ? "ru" : "en"}/account` : "";

  const text = isRu
    ? `Ваш код подтверждения: ${code}\n\n${loginUrl ? `Личный кабинет: ${loginUrl}\n` : ""}\nЕсли вы не запрашивали код — просто проигнорируйте это письмо.`
    : `Your verification code: ${code}\n\n${loginUrl ? `Account: ${loginUrl}\n` : ""}\nIf you did not request this code, you can ignore this email.`;

  const html = isRu
    ? `<p>Ваш код подтверждения: <b>${code}</b></p>${loginUrl ? `<p>Личный кабинет: <a href="${loginUrl}">${loginUrl}</a></p>` : ""}<p>Если вы не запрашивали код — просто проигнорируйте это письмо.</p>`
    : `<p>Your verification code: <b>${code}</b></p>${loginUrl ? `<p>Account: <a href="${loginUrl}">${loginUrl}</a></p>` : ""}<p>If you did not request this code, you can ignore this email.</p>`;

  return { subject, text, html };
}

