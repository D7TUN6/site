import express from "express";
import { enforceSameOrigin } from "../lib/request-origin.mjs";
import { createEmbeddedPayment, fetchPayment, minorToYooKassaValue } from "../lib/yookassa.mjs";
import { getOptionalEnv } from "../lib/config.mjs";
import { requireUser } from "../middleware/require-auth.mjs";

function nowMs() {
  return Date.now();
}

function safeJsonStringify(value, maxLen = 6000) {
  const text = JSON.stringify(value ?? null);
  if (text.length > maxLen) {
    throw new Error("Payload too large");
  }
  return text;
}

function toMinorUnits(amountValue) {
  if (typeof amountValue !== "string") return null;
  const match = amountValue.trim().match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const rub = Number(match[1]);
  const kop = Number(String(match[2] || "0").padEnd(2, "0"));
  if (!Number.isFinite(rub) || !Number.isFinite(kop)) return null;
  return rub * 100 + kop;
}

export function createYooKassaRouter({ db, hub }) {
  const router = express.Router();

  router.post("/create", enforceSameOrigin, requireUser, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const shopId = getOptionalEnv("YOOKASSA_SHOP_ID", "");
    const secretKey = getOptionalEnv("YOOKASSA_SECRET_KEY", "");
    if (!shopId || !secretKey) {
      return res.status(501).json({ error: "YooKassa is not configured" });
    }

    const orderId = typeof req.body?.orderId === "string" ? req.body.orderId.trim() : "";
    if (!orderId) {
      return res.status(400).json({ error: "Invalid order id" });
    }

    const order = db.prepare("SELECT * FROM orders WHERE id = ? LIMIT 1").get(orderId);
    if (!order) {
      return res.status(404).json({ error: "Not found" });
    }
    if (order.user_id !== req.user.id && !req.isAdmin) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (order.status !== "pending_payment") {
      return res.status(409).json({ error: "Order is not payable" });
    }

    const description = `Order ${order.id} (${order.user_email})`;

    try {
      const created = await createEmbeddedPayment({
        amountMinor: order.items_total,
        currency: order.currency,
        description,
        metadata: { orderId: order.id }
      });

      const updatedAt = nowMs();
      db.exec("BEGIN IMMEDIATE;");
      try {
        db.prepare(
          "UPDATE orders SET payment_provider = ?, payment_id = ?, payment_status = ?, updated_at = ? WHERE id = ?"
        ).run("yookassa", String(created.paymentId || ""), String(created.status || ""), updatedAt, order.id);

        db.prepare("INSERT INTO order_events (order_id, kind, message, data_json, created_at) VALUES (?, ?, ?, ?, ?)").run(
          order.id,
          "payment_created",
          "YooKassa payment created",
          safeJsonStringify({ paymentId: created.paymentId, status: created.status }, 2000),
          updatedAt
        );
        db.exec("COMMIT;");
      } catch (error) {
        try {
          db.exec("ROLLBACK;");
        } catch {
          // ignore
        }
        throw error;
      }

      hub?.publish?.(order.id, { type: "payment.created", orderId: order.id, paymentId: created.paymentId });

      return res.status(200).json({
        ok: true,
        orderId: order.id,
        paymentId: created.paymentId,
        status: created.status,
        amount: {
          currency: order.currency,
          value: minorToYooKassaValue(order.items_total)
        },
        confirmationToken: created.confirmationToken
      });
    } catch (error) {
      console.error("yookassa payment create failed", error);
      return res.status(502).json({ error: "Unable to create payment" });
    }
  });

  // Webhook endpoint for YooKassa notifications (payment.succeeded / payment.canceled / etc)
  router.post("/webhook", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");

    const paymentId = typeof req.body?.object?.id === "string" ? req.body.object.id : "";
    if (!paymentId) {
      return res.status(400).json({ error: "Missing payment id" });
    }

    const order = db.prepare("SELECT * FROM orders WHERE payment_id = ? LIMIT 1").get(paymentId);
    if (!order) {
      // Acknowledge to stop retries; unknown payment for this app.
      return res.status(200).json({ ok: true });
    }

    let payment;
    try {
      payment = await fetchPayment(paymentId);
    } catch (error) {
      console.error("yookassa webhook: unable to verify payment", error);
      return res.status(200).json({ ok: true });
    }

    const metadataOrderId = payment?.metadata?.orderId;
    if (metadataOrderId && metadataOrderId !== order.id) {
      console.error("yookassa webhook: order id mismatch", { paymentId, metadataOrderId, expected: order.id });
      return res.status(200).json({ ok: true });
    }

    const value = payment?.amount?.value;
    const minor = typeof value === "string" ? toMinorUnits(value) : null;
    if (minor != null && minor !== order.items_total) {
      console.error("yookassa webhook: amount mismatch", { paymentId, minor, expected: order.items_total });
      return res.status(200).json({ ok: true });
    }

    const status = String(payment?.status || "");
    const paid = Boolean(payment?.paid);
    const updatedAt = nowMs();

    db.exec("BEGIN IMMEDIATE;");
    try {
      db.prepare("UPDATE orders SET payment_status = ?, updated_at = ? WHERE id = ?").run(status, updatedAt, order.id);

      if (paid && status === "succeeded" && order.status !== "paid") {
        const paidAt = updatedAt;
        const paymentAmountMinor = minor != null ? minor : order.items_total;

        db.prepare("UPDATE orders SET status = ?, payment_amount = ?, paid_at = ?, updated_at = ? WHERE id = ?").run(
          "paid",
          paymentAmountMinor,
          paidAt,
          updatedAt,
          order.id
        );

        db.prepare("INSERT INTO order_events (order_id, kind, message, data_json, created_at) VALUES (?, ?, ?, ?, ?)").run(
          order.id,
          "payment_succeeded",
          "Payment succeeded",
          safeJsonStringify({ paymentId, status }, 2000),
          updatedAt
        );
      } else if (status === "canceled" && order.status === "pending_payment") {
        db.prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?").run("canceled", updatedAt, order.id);
        db.prepare("INSERT INTO order_events (order_id, kind, message, data_json, created_at) VALUES (?, ?, ?, ?, ?)").run(
          order.id,
          "payment_canceled",
          "Payment canceled",
          safeJsonStringify({ paymentId, status }, 2000),
          updatedAt
        );
      }

      db.exec("COMMIT;");
    } catch (error) {
      try {
        db.exec("ROLLBACK;");
      } catch {
        // ignore
      }
      console.error("yookassa webhook: db update failed", error);
      return res.status(200).json({ ok: true });
    }

    hub?.publish?.(order.id, { type: "payment.updated", orderId: order.id, paymentId, status, paid });

    return res.status(200).json({ ok: true });
  });

  return router;
}
