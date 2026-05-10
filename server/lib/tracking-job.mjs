import { getOptionalEnv } from "./config.mjs";
import { trackGoLookup, trackGoToStatus } from "./tracking-trackgo.mjs";

function nowMs() {
  return Date.now();
}

function parseIntervalMs(raw, fallback) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 10_000) return fallback;
  return Math.floor(value);
}

function safeJsonStringify(value, maxLen = 4000) {
  const text = JSON.stringify(value ?? null);
  if (text.length > maxLen) {
    return "{}";
  }
  return text;
}

function shouldMarkDelivered(unifiedStatus) {
  const v = String(unifiedStatus || "").toLowerCase();
  return v === "delivered" || v === "delivered_to_recipient";
}

export function startTrackingJob({ db, hub }) {
  const apiKey = getOptionalEnv("TRACKGO_API_KEY", "");
  if (!apiKey) {
    return { started: false };
  }

  const intervalMs = parseIntervalMs(getOptionalEnv("TRACKING_POLL_INTERVAL_MS", ""), 10 * 60 * 1000);
  const maxPerTick = Math.max(1, Math.min(50, Number(getOptionalEnv("TRACKING_POLL_MAX", "20"))));

  async function tick() {
    const rows = db
      .prepare(
        `
        SELECT id, tracking_number, status
        FROM orders
        WHERE tracking_number IS NOT NULL
          AND tracking_number != ''
          AND status IN ('shipped')
        ORDER BY updated_at ASC
        LIMIT ?
      `
      )
      .all(maxPerTick);

    for (const row of rows) {
      try {
        const payload = await trackGoLookup({ trackCode: row.tracking_number, language: "ru" });
        const status = trackGoToStatus(payload);
        if (!status?.message) {
          continue;
        }

        const updatedAt = nowMs();

        db.exec("BEGIN IMMEDIATE;");
        try {
          const nextOrderStatus = shouldMarkDelivered(status.unifiedStatus) ? "delivered" : row.status;
          db.prepare("UPDATE orders SET tracking_status = ?, status = ?, updated_at = ? WHERE id = ?").run(
            status.message,
            nextOrderStatus,
            updatedAt,
            row.id
          );
          db.prepare("INSERT INTO order_events (order_id, kind, message, data_json, created_at) VALUES (?, ?, ?, ?, ?)").run(
            row.id,
            "tracking_update",
            "Tracking updated",
            safeJsonStringify({ unifiedStatus: status.unifiedStatus, message: status.message }, 2000),
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

        hub?.publish?.(row.id, { type: "tracking.updated", orderId: row.id });
      } catch (error) {
        // Keep job resilient: log and continue.
        console.error("tracking job tick failed", { orderId: row.id, error });
      }
    }
  }

  const timer = setInterval(() => {
    void tick();
  }, intervalMs);

  // Kick once on start (async).
  void tick();

  return {
    started: true,
    stop: () => clearInterval(timer),
    intervalMs
  };
}

