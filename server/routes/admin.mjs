import crypto from "node:crypto";
import express from "express";
import { enforceSameOrigin } from "../lib/request-origin.mjs";
import { getOptionalEnv, requireEnv } from "../lib/config.mjs";
import { getCookie } from "../lib/cookies.mjs";
import {
  ADMIN_SESSION_COOKIE,
  clearAdminSessionCookie,
  createAdminSession,
  revokeAdminSession,
  setAdminSessionCookie
} from "../lib/sessions.mjs";
import { requireAdmin } from "../middleware/require-auth.mjs";

function nowMs() {
  return Date.now();
}

function normalizeEmail(raw) {
  if (typeof raw !== "string") return "";
  return raw.trim().toLowerCase();
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function safeJsonStringify(value, maxLen = 8000) {
  const text = JSON.stringify(value ?? null);
  if (text.length > maxLen) {
    throw new Error("Payload too large");
  }
  return text;
}

function safeParseJson(text) {
  if (typeof text !== "string" || !text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeStatus(raw) {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (value === "pending_payment" || value === "paid" || value === "shipped" || value === "delivered" || value === "canceled") {
    return value;
  }
  return null;
}

export function createAdminRouter({ db, hub }) {
  const router = express.Router();

  router.get("/me", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ok: true, isAdmin: Boolean(req.isAdmin) });
  });

  router.post("/logout", enforceSameOrigin, (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const token = getCookie(req, ADMIN_SESSION_COOKIE);
    if (token) {
      revokeAdminSession(db, token);
    }
    clearAdminSessionCookie(res);
    return res.status(200).json({ ok: true });
  });

  router.post("/login", enforceSameOrigin, (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const email = normalizeEmail(req.body?.email);
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    const adminEmail = normalizeEmail(requireEnv("ADMIN_EMAIL"));
    const adminPassword = requireEnv("ADMIN_PASSWORD");

    if (!email || !password) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    if (!safeEqual(email, adminEmail) || !safeEqual(password, adminPassword)) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const session = createAdminSession(db, {
      ip: req.ip,
      userAgent: String(req.get("user-agent") || "")
    });
    setAdminSessionCookie(res, session.token);
    return res.status(200).json({ ok: true });
  });

  router.get("/orders", requireAdmin, (req, res) => {
    res.setHeader("Cache-Control", "no-store");

    const limit = Math.max(1, Math.min(200, Number(req.query.limit || 100)));

    const orders = db
      .prepare(
        `
        SELECT id, user_id, user_email, status, currency, items_total,
               shipping_provider, pickup_point_json, customer_comment,
               payment_provider, payment_id, payment_status, payment_amount, paid_at,
               shipping_eta, tracking_number, tracking_status,
               created_at, updated_at
        FROM orders
        ORDER BY created_at DESC
        LIMIT ?
      `
      )
      .all(limit)
      .map((row) => ({
        id: row.id,
        userId: row.user_id,
        email: row.user_email,
        status: row.status,
        itemsTotalMinor: row.items_total,
        shippingProvider: row.shipping_provider,
        pickupPoint: safeParseJson(row.pickup_point_json),
        comment: row.customer_comment,
        payment: {
          provider: row.payment_provider,
          id: row.payment_id,
          status: row.payment_status,
          amountMinor: row.payment_amount,
          paidAt: row.paid_at
        },
        shippingEta: row.shipping_eta,
        tracking: {
          number: row.tracking_number,
          status: row.tracking_status
        },
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));

    return res.status(200).json({ ok: true, orders });
  });

  router.patch("/orders/:orderId", enforceSameOrigin, requireAdmin, (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const orderId = typeof req.params.orderId === "string" ? req.params.orderId : "";
    if (!orderId) {
      return res.status(400).json({ error: "Invalid order id" });
    }

    const existing = db.prepare("SELECT id, status FROM orders WHERE id = ? LIMIT 1").get(orderId);
    if (!existing) {
      return res.status(404).json({ error: "Not found" });
    }

    const nextStatus = normalizeStatus(req.body?.status);
    const trackingNumber = typeof req.body?.trackingNumber === "string" ? req.body.trackingNumber.trim() : null;
    const trackingStatus = typeof req.body?.trackingStatus === "string" ? req.body.trackingStatus.trim() : null;
    const shippingEta = typeof req.body?.shippingEta === "string" ? req.body.shippingEta.trim().slice(0, 120) : null;

    const pickupPoint = req.body?.pickupPoint && typeof req.body.pickupPoint === "object" ? req.body.pickupPoint : null;
    const pickupPointJson = pickupPoint ? safeJsonStringify(pickupPoint, 8000) : null;

    const comment = typeof req.body?.comment === "string" ? req.body.comment.trim().slice(0, 600) : null;

    const updatedAt = nowMs();

    db.exec("BEGIN IMMEDIATE;");
    try {
      const updates = [];
      const params = [];

      if (nextStatus) {
        updates.push("status = ?");
        params.push(nextStatus);
      }

      if (trackingNumber != null) {
        updates.push("tracking_number = ?");
        params.push(trackingNumber || null);
      }

      if (trackingStatus != null) {
        updates.push("tracking_status = ?");
        params.push(trackingStatus || null);
      }

      if (shippingEta != null) {
        updates.push("shipping_eta = ?");
        params.push(shippingEta || null);
      }

      if (pickupPointJson != null) {
        updates.push("pickup_point_json = ?");
        params.push(pickupPointJson);
      }

      if (comment != null) {
        updates.push("customer_comment = ?");
        params.push(comment);
      }

      if (updates.length === 0) {
        db.exec("ROLLBACK;");
        return res.status(400).json({ error: "No changes" });
      }

      updates.push("updated_at = ?");
      params.push(updatedAt);

      params.push(orderId);
      db.prepare(`UPDATE orders SET ${updates.join(", ")} WHERE id = ?`).run(...params);

      db.prepare("INSERT INTO order_events (order_id, kind, message, data_json, created_at) VALUES (?, ?, ?, ?, ?)").run(
        orderId,
        "admin_update",
        "Admin updated order",
        safeJsonStringify({ status: nextStatus, trackingNumber, trackingStatus, shippingEta }, 2000),
        updatedAt
      );

      db.exec("COMMIT;");
    } catch (error) {
      try {
        db.exec("ROLLBACK;");
      } catch {
        // ignore
      }
      console.error("admin order update failed", error);
      return res.status(500).json({ error: "Unable to update order" });
    }

    hub?.publish?.(orderId, { type: "order.updated", orderId });
    return res.status(200).json({ ok: true });
  });

  router.get("/stream", requireAdmin, (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    res.write(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`);

    const unsubscribe = hub?.subscribe?.(({ orderId, payload }) => {
      res.write(`event: order\ndata: ${JSON.stringify({ orderId, payload })}\n\n`);
    });

    const keepAlive = setInterval(() => {
      res.write(`: ping\n\n`);
    }, 15000);

    req.on("close", () => {
      clearInterval(keepAlive);
      try {
        unsubscribe?.();
      } catch {
        // ignore
      }
    });
  });

  router.get("/config", requireAdmin, (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      ok: true,
      features: {
        trackingAutoUpdate: Boolean(getOptionalEnv("CDEK_CLIENT_ID", "") || getOptionalEnv("RUSSIAN_POST_TOKEN", ""))
      }
    });
  });

  return router;
}

