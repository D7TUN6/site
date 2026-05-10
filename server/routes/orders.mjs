import crypto from "node:crypto";
import express from "express";
import { enforceSameOrigin } from "../lib/request-origin.mjs";
import { getProductBySlug } from "../lib/shop-catalog.mjs";
import { requireUser } from "../middleware/require-auth.mjs";

function nowMs() {
  return Date.now();
}

function moneyFromMinor(minor) {
  const safe = Number.isFinite(minor) ? Math.floor(minor) : 0;
  const rub = Math.floor(safe / 100);
  const kop = Math.abs(safe % 100);
  return { currency: "RUB", value: `${rub}.${String(kop).padStart(2, "0")}` };
}

function normalizeProvider(raw) {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (value === "cdek" || value === "russian_post" || value === "ozon" || value === "avito" || value === "custom") {
    return value;
  }
  return null;
}

function safeJsonStringify(value, maxLen = 4000) {
  const text = JSON.stringify(value ?? null);
  if (text.length > maxLen) {
    throw new Error("Payload too large");
  }
  return text;
}

function sanitizeComment(raw) {
  const value = typeof raw === "string" ? raw.trim() : "";
  return value.length > 600 ? value.slice(0, 600) : value;
}

function normalizePickupPoint(provider, raw) {
  if (!raw || typeof raw !== "object") return null;
  const record = raw;

  if (provider === "custom") {
    const address = typeof record.address === "string" ? record.address.trim() : "";
    if (!address) return null;
    return { provider: "custom", address: address.slice(0, 240) };
  }

  const id = typeof record.id === "string" ? record.id.trim() : "";
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const address = typeof record.address === "string" ? record.address.trim() : "";
  const lat = Number.isFinite(record.lat) ? Number(record.lat) : null;
  const lon = Number.isFinite(record.lon) ? Number(record.lon) : null;

  if (!id || id.length > 200) return null;
  if (!name || name.length > 200) return null;
  if (!address || address.length > 400) return null;
  if (lat == null || lon == null) return null;
  if (lat < -90 || lat > 90) return null;
  if (lon < -180 || lon > 180) return null;

  return {
    id,
    provider,
    name,
    address,
    lat,
    lon
  };
}

export function createOrdersRouter({ db, hub }) {
  const router = express.Router();

  router.get("/mine", requireUser, (req, res) => {
    res.setHeader("Cache-Control", "no-store");

    const rows = db
      .prepare(
        `
        SELECT id, status, currency, items_total, shipping_provider, pickup_point_json,
               payment_provider, payment_status, payment_amount, paid_at,
               shipping_eta, tracking_number, tracking_status,
               created_at, updated_at
        FROM orders
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 100
      `
      )
      .all(req.user.id);

    const orders = rows.map((row) => ({
      id: row.id,
      status: row.status,
      total: moneyFromMinor(row.items_total),
      shippingProvider: row.shipping_provider,
      pickupPoint: safeParseJson(row.pickup_point_json),
      payment: {
        provider: row.payment_provider,
        status: row.payment_status,
        amount: row.payment_amount != null ? moneyFromMinor(row.payment_amount) : null,
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

  router.get("/stream", requireUser, (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    res.write(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`);

    const unsubscribe = hub?.subscribe?.(({ orderId, payload }) => {
      try {
        const row = db.prepare("SELECT user_id FROM orders WHERE id = ? LIMIT 1").get(orderId);
        if (!row || row.user_id !== req.user.id) return;
        res.write(`event: order\ndata: ${JSON.stringify({ orderId, payload })}\n\n`);
      } catch {
        // ignore
      }
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

  router.get("/:orderId", requireUser, (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const orderId = typeof req.params.orderId === "string" ? req.params.orderId : "";
    if (!orderId) {
      return res.status(400).json({ error: "Invalid order id" });
    }

    const order = db
      .prepare(
        `
        SELECT *
        FROM orders
        WHERE id = ?
        LIMIT 1
      `
      )
      .get(orderId);

    if (!order) {
      return res.status(404).json({ error: "Not found" });
    }

    if (order.user_id !== req.user.id && !req.isAdmin) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const items = db
      .prepare(
        `
        SELECT product_slug, product_title, unit_price, quantity
        FROM order_items
        WHERE order_id = ?
        ORDER BY id ASC
      `
      )
      .all(orderId)
      .map((row) => ({
        slug: row.product_slug,
        title: row.product_title,
        unitPrice: moneyFromMinor(row.unit_price),
        quantity: row.quantity
      }));

    const events = db
      .prepare(
        `
        SELECT id, kind, message, data_json, created_at
        FROM order_events
        WHERE order_id = ?
        ORDER BY id ASC
      `
      )
      .all(orderId)
      .map((row) => ({
        id: row.id,
        kind: row.kind,
        message: row.message,
        data: safeParseJson(row.data_json),
        createdAt: row.created_at
      }));

    return res.status(200).json({
      ok: true,
      order: {
        id: order.id,
        status: order.status,
        email: order.user_email,
        total: moneyFromMinor(order.items_total),
        shippingProvider: order.shipping_provider,
        pickupPoint: safeParseJson(order.pickup_point_json),
        comment: order.customer_comment,
        payment: {
          provider: order.payment_provider,
          id: order.payment_id,
          status: order.payment_status,
          amount: order.payment_amount != null ? moneyFromMinor(order.payment_amount) : null,
          paidAt: order.paid_at
        },
        shippingEta: order.shipping_eta,
        tracking: {
          number: order.tracking_number,
          status: order.tracking_status
        },
        createdAt: order.created_at,
        updatedAt: order.updated_at
      },
      items,
      events
    });
  });

  router.get("/:orderId/stream", requireUser, (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const orderId = typeof req.params.orderId === "string" ? req.params.orderId : "";
    if (!orderId) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: "Invalid order id" })}\n\n`);
      res.end();
      return;
    }

    const order = db.prepare("SELECT id, user_id FROM orders WHERE id = ? LIMIT 1").get(orderId);
    if (!order) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: "Not found" })}\n\n`);
      res.end();
      return;
    }

    if (order.user_id !== req.user.id && !req.isAdmin) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: "Forbidden" })}\n\n`);
      res.end();
      return;
    }

    res.write(`event: hello\ndata: ${JSON.stringify({ ok: true, orderId })}\n\n`);

    const unsubscribe = hub?.subscribe?.(({ orderId: changedId, payload }) => {
      if (String(changedId) !== String(orderId)) return;
      res.write(`event: order\ndata: ${JSON.stringify(payload)}\n\n`);
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

  router.post("/", enforceSameOrigin, requireUser, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");

    const provider = normalizeProvider(req.body?.shippingProvider);
    if (!provider) {
      return res.status(400).json({ error: "Invalid shipping provider" });
    }

    const pickupPoint = normalizePickupPoint(provider, req.body?.pickupPoint);
    if (!pickupPoint) {
      return res.status(400).json({ error: "Invalid pickup point" });
    }

    const comment = sanitizeComment(req.body?.comment);

    const itemsRaw = Array.isArray(req.body?.items) ? req.body.items : null;
    if (!itemsRaw || itemsRaw.length === 0) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    const normalizedItems = [];
    for (const entry of itemsRaw) {
      const slug = typeof entry?.slug === "string" ? entry.slug.trim() : "";
      const quantity = Number.isFinite(entry?.quantity) ? Math.floor(entry.quantity) : 0;
      if (!slug || quantity <= 0) continue;
      if (quantity > 9999) return res.status(400).json({ error: "Quantity too large" });
      normalizedItems.push({ slug, quantity });
    }

    if (normalizedItems.length === 0) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    let totalMinor = 0;
    const orderItems = [];

    for (const item of normalizedItems) {
      const product = await getProductBySlug(item.slug);
      if (!product) {
        return res.status(400).json({ error: `Unknown product: ${item.slug}` });
      }

      const lineMinor = product.unitAmount * item.quantity;
      totalMinor += lineMinor;
      orderItems.push({
        slug: product.slug,
        title: product.title,
        unitPriceMinor: product.unitAmount,
        quantity: item.quantity
      });
    }

    if (totalMinor <= 0) {
      return res.status(400).json({ error: "Invalid total" });
    }

    const createdAt = nowMs();
    const orderId = crypto.randomUUID();

    const pickupPointJson = (() => {
      try {
        return safeJsonStringify(pickupPoint, 6000);
      } catch {
        return null;
      }
    })();
    if (!pickupPointJson) {
      return res.status(400).json({ error: "Pickup point payload too large" });
    }

    db.exec("BEGIN IMMEDIATE;");
    try {
      db.prepare(
        `
        INSERT INTO orders (
          id, user_id, user_email, status,
          currency, items_total,
          shipping_provider, pickup_point_json, customer_comment,
          payment_provider, payment_id, payment_status, payment_amount, paid_at,
          shipping_eta, tracking_number, tracking_status,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)
      `
      ).run(
        orderId,
        req.user.id,
        req.user.email,
        "pending_payment",
        "RUB",
        totalMinor,
        provider,
        pickupPointJson,
        comment,
        createdAt,
        createdAt
      );

      const insertItem = db.prepare(
        "INSERT INTO order_items (order_id, product_slug, product_title, unit_price, quantity) VALUES (?, ?, ?, ?, ?)"
      );
      for (const item of orderItems) {
        insertItem.run(orderId, item.slug, item.title, item.unitPriceMinor, item.quantity);
      }

      db.prepare("INSERT INTO order_events (order_id, kind, message, data_json, created_at) VALUES (?, ?, ?, ?, ?)").run(
        orderId,
        "created",
        "Order created",
        safeJsonStringify({ provider, pickupPoint }, 6000),
        createdAt
      );

      db.exec("COMMIT;");
    } catch (error) {
      try {
        db.exec("ROLLBACK;");
      } catch {
        // ignore
      }
      console.error("order create failed", error);
      return res.status(500).json({ error: "Unable to create order" });
    }

    hub?.publish?.(orderId, { type: "order.created", orderId });

    return res.status(200).json({
      ok: true,
      order: {
        id: orderId,
        status: "pending_payment",
        total: moneyFromMinor(totalMinor),
        currency: "RUB"
      }
    });
  });

  return router;
}

function safeParseJson(text) {
  if (typeof text !== "string" || !text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
