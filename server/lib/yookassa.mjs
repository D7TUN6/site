import crypto from "node:crypto";
import { requireEnv } from "./config.mjs";

const API_BASE = "https://api.yookassa.ru";

function authHeader() {
  const shopId = requireEnv("YOOKASSA_SHOP_ID");
  const secretKey = requireEnv("YOOKASSA_SECRET_KEY");
  const token = Buffer.from(`${shopId}:${secretKey}`).toString("base64");
  return `Basic ${token}`;
}

function toMinorUnits(amountValue) {
  // amountValue is a string like "800.00"
  if (typeof amountValue !== "string") return null;
  const match = amountValue.trim().match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const rub = Number(match[1]);
  const kop = Number(String(match[2] || "0").padEnd(2, "0"));
  if (!Number.isFinite(rub) || !Number.isFinite(kop)) return null;
  return rub * 100 + kop;
}

export function minorToYooKassaValue(minor) {
  const safe = Number.isFinite(minor) ? Math.floor(minor) : 0;
  const rub = Math.floor(safe / 100);
  const kop = Math.abs(safe % 100);
  return `${rub}.${String(kop).padStart(2, "0")}`;
}

export async function createEmbeddedPayment({ amountMinor, currency = "RUB", description, metadata }) {
  const idempotenceKey = crypto.randomUUID();

  const response = await fetch(`${API_BASE}/v3/payments`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      "Idempotence-Key": idempotenceKey
    },
    body: JSON.stringify({
      amount: {
        value: minorToYooKassaValue(amountMinor),
        currency
      },
      capture: true,
      confirmation: {
        type: "embedded"
      },
      description,
      metadata
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.description || payload?.error?.description || "Unable to create payment";
    throw new Error(String(message));
  }

  const confirmationToken = payload?.confirmation?.confirmation_token;
  if (typeof confirmationToken !== "string" || !confirmationToken) {
    throw new Error("Missing confirmation_token from YooKassa");
  }

  const value = payload?.amount?.value;
  if (typeof value === "string") {
    const minor = toMinorUnits(value);
    if (minor != null && minor !== amountMinor) {
      throw new Error("YooKassa amount mismatch");
    }
  }

  return {
    paymentId: payload?.id,
    status: payload?.status,
    confirmationToken
  };
}

export async function fetchPayment(paymentId) {
  const id = String(paymentId || "");
  if (!id) {
    throw new Error("Missing payment id");
  }

  const response = await fetch(`${API_BASE}/v3/payments/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: {
      Authorization: authHeader()
    }
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.description || payload?.error?.description || "Unable to fetch payment";
    throw new Error(String(message));
  }

  return payload;
}

