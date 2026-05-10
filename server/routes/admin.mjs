import crypto from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, writeFile, readFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import busboy from "busboy";
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
import { optimizeAlbum } from "../lib/media-optimizer.mjs";
import { regenerateManifests, generateReleaseMdx, regenerateContentManifest } from "../lib/release-regenerator.mjs";
import { regenerateShopManifest } from "../lib/shop-regenerator.mjs";

// Fire-and-forget Vite rebuild so static assets (CSS, JS) reflect server-side changes
async function silentRebuild() {
  // Use dynamic import to avoid top-level await issues
  import("node:child_process").then(({ spawn: sp }) => {
    const proc = sp("node", ["node_modules/.bin/vite", "build"], {
      cwd: ROOT,
      stdio: "ignore",
      detached: true
    });
    proc.unref();
  }).catch(() => {});
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");

const TRACK_EXT = new Set([".wav", ".mp3", ".flac", ".ogg"]);
const COVER_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

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

export function createAdminRouter({ db, hub, service }) {
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

  // ── Release upload ─────────────────────────────────────────────────────────
  // GET /api/admin/releases — list releases from filesystem + manifest
  router.get("/releases", requireAdmin, async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const MUSIC_ROOT = path.join(ROOT, "public", "media", "music");
      const MANIFEST_PATH = path.join(ROOT, "src", "generated", "release-manifest.json");

      // Load manifest for track info
      let manifestReleases = [];
      try {
        const raw = await import("node:fs/promises").then(({ readFile }) => readFile(MANIFEST_PATH, "utf-8"));
        const manifest = JSON.parse(raw);
        manifestReleases = Array.isArray(manifest.releases) ? manifest.releases : [];
      } catch {
        // manifest may not exist yet
      }

      const dirents = await readdir(MUSIC_ROOT, { withFileTypes: true }).catch(() => []);
      const releases = await Promise.all(
        dirents
          .filter((d) => d.isDirectory())
          .map(async (d) => {
            const slug = slugify(d.name);
            const mRelease = manifestReleases.find((r) => r.slug === slug);
            const tracks = mRelease?.tracks?.map((t) => {
              // sourceUrl is like /media/music/Album/tracks/wav/Track.wav
              // Extract path relative to tracks/ so subdirectories (e.g. wav/) are preserved
              let filename = "";
              if (t.sourceUrl) {
                const tracksPrefix = `/media/music/${d.name}/tracks/`;
                if (t.sourceUrl.startsWith(tracksPrefix)) {
                  filename = t.sourceUrl.slice(tracksPrefix.length);
                } else {
                  filename = path.basename(t.sourceUrl);
                }
              }
              return { filename, title: t.title };
            }) ?? [];

            // Read notes file
            const notesPath = path.join(MUSIC_ROOT, d.name, "notes", "notes");
            let notes = "";
            try {
              notes = await import("node:fs/promises").then(({ readFile }) => readFile(notesPath, "utf-8"));
            } catch {
              // notes may not exist
            }

            return {
              slug,
              albumName: d.name,
              tracks,
              coverUrl: mRelease?.coverUrl ?? null,
              notes,
              releaseDate: mRelease?.releaseDate ?? null,
              releaseType: mRelease?.releaseType ?? "album"
            };
          })
      );
      return res.status(200).json({ ok: true, releases });
    } catch (err) {
      console.error("admin releases list failed", err);
      return res.status(500).json({ error: "Unable to list releases" });
    }
  });

  // PATCH /api/admin/releases/:slug — rename album, update notes, track ops, cover replacement
  // Accepts multipart/form-data OR application/json
  router.patch("/releases/:slug", enforceSameOrigin, requireAdmin, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const slug = typeof req.params.slug === "string" ? req.params.slug.trim() : "";
    if (!slug) return res.status(400).json({ error: "Invalid slug" });

    const MUSIC_ROOT = path.join(ROOT, "public", "media", "music");
    const dirents = await readdir(MUSIC_ROOT, { withFileTypes: true }).catch(() => []);
    const existing = dirents.find((d) => d.isDirectory() && slugify(d.name) === slug);
    if (!existing) return res.status(404).json({ error: "Release not found" });

    const albumDir = path.join(MUSIC_ROOT, existing.name);
    const contentType = req.headers["content-type"] || "";

    // Parse fields — either multipart (cover upload) or JSON
    let newAlbumName = null;
    let newNotes = null;
    let newReleaseType = null;
    let newReleaseDate = null;
    let deleteCover = false;
    // trackRenames: { [oldFilename]: newFilename }
    let trackRenames = null;
    // trackDeletes: string[] of filenames to delete
    let trackDeletes = null;
    let newTracks = []; // newly uploaded track files: { filename, tmpPath }
    let newCoverPath = null;
    let newCoverExt = null;
    let parseError = null;

    if (contentType.includes("multipart/form-data")) {
      try {
        await new Promise((resolve, reject) => {
          const bb = busboy({ headers: req.headers, limits: { fileSize: 500 * 1024 * 1024, files: 70 } });
          const pending = [];

          bb.on("field", (name, value) => {
            if (name === "albumName") newAlbumName = value.trim() || null;
            if (name === "notes") newNotes = value;
            if (name === "releaseType") newReleaseType = value.trim() || null;
            if (name === "releaseDate") newReleaseDate = value.trim() || null;
            if (name === "deleteCover") deleteCover = value === "true" || value === "1";
            if (name === "trackRenames") trackRenames = safeParseJson(value);
            if (name === "trackDeletes") trackDeletes = safeParseJson(value);
          });

          bb.on("file", (fieldname, stream, info) => {
            const { filename } = info;
            const ext = path.extname(filename).toLowerCase();

            if (fieldname === "cover" && COVER_EXT.has(ext)) {
              const tmpPath = path.join(albumDir, `cover_tmp${ext}`);
              const p = new Promise((res2, rej2) => {
                const ws = createWriteStream(tmpPath);
                stream.pipe(ws);
                ws.on("finish", () => { newCoverPath = tmpPath; newCoverExt = ext; res2(); });
                ws.on("error", rej2);
                stream.on("error", rej2);
              });
              pending.push(p);
              return;
            }

            if ((fieldname === "tracks" || fieldname === "tracks[]") && TRACK_EXT.has(ext)) {
              const tracksDir = path.join(albumDir, "tracks");
              const destPath = path.join(tracksDir, filename);
              const p = mkdir(tracksDir, { recursive: true }).then(
                () => new Promise((res2, rej2) => {
                  const ws = createWriteStream(destPath);
                  stream.pipe(ws);
                  ws.on("finish", () => { newTracks.push({ filename, destPath }); res2(); });
                  ws.on("error", rej2);
                  stream.on("error", rej2);
                })
              );
              pending.push(p);
              return;
            }

            stream.resume();
          });

          bb.on("error", reject);
          bb.on("finish", () => Promise.all(pending).then(resolve).catch(reject));
          req.pipe(bb);
        });
      } catch (err) {
        parseError = err;
      }
    } else {
      // JSON body
      newAlbumName = typeof req.body?.albumName === "string" ? req.body.albumName.trim() || null : null;
      newNotes = typeof req.body?.notes === "string" ? req.body.notes : null;
      newReleaseType = typeof req.body?.releaseType === "string" ? req.body.releaseType.trim() || null : null;
      newReleaseDate = typeof req.body?.releaseDate === "string" ? req.body.releaseDate.trim() || null : null;
      deleteCover = Boolean(req.body?.deleteCover);
      trackRenames = req.body?.trackRenames && typeof req.body.trackRenames === "object" ? req.body.trackRenames : null;
      trackDeletes = Array.isArray(req.body?.trackDeletes) ? req.body.trackDeletes : null;
    }

    if (parseError) {
      console.error("admin release patch: parse error", parseError);
      return res.status(500).json({ error: "Upload failed" });
    }

    try {
      // Update notes
      if (newNotes !== null) {
        const notesDir = path.join(albumDir, "notes");
        await mkdir(notesDir, { recursive: true });
        await writeFile(path.join(notesDir, "notes"), newNotes, "utf-8");
      }

      // Delete cover if requested
      if (deleteCover) {
        const coverDir = path.join(albumDir, "cover");
        try {
          await rm(coverDir, { recursive: true, force: true });
        } catch {
          // ignore if cover doesn't exist
        }
      }

      // Replace cover
      if (newCoverPath && newCoverExt) {
        const coverDir = path.join(albumDir, "cover");
        await mkdir(coverDir, { recursive: true });
        const destCover = path.join(coverDir, `cover${newCoverExt}`);
        await rename(newCoverPath, destCover);
      }

      // Save release type and date to metadata file
      if (newReleaseType !== null || newReleaseDate !== null) {
        const metaPath = path.join(albumDir, "release-meta.json");
        let meta = {};
        try {
          const raw = await import("node:fs/promises").then(({ readFile }) => readFile(metaPath, "utf-8"));
          meta = JSON.parse(raw);
        } catch {
          // meta file doesn't exist yet
        }
        if (newReleaseType !== null) meta.releaseType = newReleaseType;
        if (newReleaseDate !== null) meta.releaseDate = newReleaseDate;
        await writeFile(metaPath, JSON.stringify(meta, null, 2), "utf-8");
      }

      // Delete tracks
      if (Array.isArray(trackDeletes) && trackDeletes.length > 0) {
        const tracksDir = path.join(albumDir, "tracks");
        for (const filename of trackDeletes) {
          if (typeof filename !== "string" || filename.includes("..")) continue;
          const filePath = path.resolve(tracksDir, filename);
          if (!filePath.startsWith(tracksDir + path.sep) && filePath !== tracksDir) continue;
          await rm(filePath, { force: true });
        }
      }

      // Rename tracks
      if (trackRenames && typeof trackRenames === "object") {
        const tracksDir = path.join(albumDir, "tracks");
        for (const [oldName, newName] of Object.entries(trackRenames)) {
          if (typeof oldName !== "string" || typeof newName !== "string") continue;
          if (oldName.includes("..") || newName.includes("..")) continue;
          const oldPath = path.resolve(tracksDir, oldName);
          const newPath = path.resolve(tracksDir, newName);
          if (!oldPath.startsWith(tracksDir + path.sep) || !newPath.startsWith(tracksDir + path.sep)) continue;
          await rename(oldPath, newPath).catch(() => {});
        }
      }

      // Rename album directory last (after track ops)
      let finalDir = albumDir;
      if (newAlbumName && newAlbumName !== existing.name) {
        const newDir = path.join(MUSIC_ROOT, newAlbumName);
        await rename(albumDir, newDir);
        finalDir = newDir;
      }

      // Rebuild playlists if tracks were added or deleted (required before regenerateManifests)
      const tracksChanged = (Array.isArray(trackDeletes) && trackDeletes.length > 0) || newTracks.length > 0;
      if (tracksChanged) {
        await optimizeAlbum(ROOT, path.basename(finalDir));
      }

      await regenerateManifests();
      await service?.reload?.();

      return res.status(200).json({ ok: true, slug: slugify(path.basename(finalDir)) });
    } catch (err) {
      console.error("admin release patch failed", err);
      return res.status(500).json({ error: "Unable to update release" });
    }
  });

  // DELETE /api/admin/releases/:slug — remove release directory
  router.delete("/releases/:slug", enforceSameOrigin, requireAdmin, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const slug = typeof req.params.slug === "string" ? req.params.slug.trim() : "";
    if (!slug) return res.status(400).json({ error: "Invalid slug" });

    const MUSIC_ROOT = path.join(ROOT, "public", "media", "music");
    const dirents = await readdir(MUSIC_ROOT, { withFileTypes: true }).catch(() => []);
    const existing = dirents.find((d) => d.isDirectory() && slugify(d.name) === slug);
    if (!existing) return res.status(404).json({ error: "Release not found" });

    try {
      await rm(path.join(MUSIC_ROOT, existing.name), { recursive: true, force: true });
      await regenerateManifests();
      await service?.reload?.();
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error("admin release delete failed", err);
      return res.status(500).json({ error: "Unable to delete release" });
    }
  });

  // multipart/form-data fields:
  //   albumName     (string, required)
  //   releaseType   (string, optional: album/lp/ep/single/remaster/deluxe)
  //   releaseDate   (string, required: DD/MM/YYYY format)
  //   releaseNotes  (string, optional)
  //   tracks[]      (files, .wav/.flac/.mp3/.ogg)
  //   cover         (file, image)
  router.post("/releases", enforceSameOrigin, requireAdmin, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");

    const contentType = req.headers["content-type"] || "";
    if (!contentType.includes("multipart/form-data")) {
      return res.status(400).json({ error: "Expected multipart/form-data" });
    }

    let albumName = "";
    let releaseType = "album";
    let releaseDate = "";
    let releaseNotes = "";
    const savedTracks = [];
    let coverFileName = null;
    let parseError = null;

    try {
      await new Promise((resolve, reject) => {
        const bb = busboy({ headers: req.headers, limits: { fileSize: 500 * 1024 * 1024, files: 70 } });
        const pending = [];

        bb.on("field", (name, value) => {
          if (name === "albumName") albumName = value.trim();
          if (name === "releaseType") releaseType = value.trim();
          if (name === "releaseDate") releaseDate = value.trim();
          if (name === "releaseNotes") releaseNotes = value.trim();
        });

        bb.on("file", (fieldname, stream, info) => {
          const { filename } = info;
          const ext = path.extname(filename).toLowerCase();

          if (fieldname === "cover" && COVER_EXT.has(ext)) {
            const albumDir = path.join(ROOT, "public", "media", "music", albumName || "unknown");
            const coverDir = path.join(albumDir, "cover");
            const destName = `cover${ext}`;
            const destPath = path.join(coverDir, destName);

            const p = mkdir(coverDir, { recursive: true }).then(
              () =>
                new Promise((res2, rej2) => {
                  const ws = createWriteStream(destPath);
                  stream.pipe(ws);
                  ws.on("finish", () => { coverFileName = destName; res2(); });
                  ws.on("error", rej2);
                  stream.on("error", rej2);
                })
            );
            pending.push(p);
            return;
          }

          if ((fieldname === "tracks" || fieldname === "tracks[]") && TRACK_EXT.has(ext)) {
            const albumDir = path.join(ROOT, "public", "media", "music", albumName || "unknown");
            const tracksDir = path.join(albumDir, "tracks");
            const destPath = path.join(tracksDir, filename);

            const p = mkdir(tracksDir, { recursive: true }).then(
              () =>
                new Promise((res2, rej2) => {
                  const ws = createWriteStream(destPath);
                  stream.pipe(ws);
                  ws.on("finish", () => { savedTracks.push(filename); res2(); });
                  ws.on("error", rej2);
                  stream.on("error", rej2);
                })
            );
            pending.push(p);
            return;
          }

          // Drain unknown fields
          stream.resume();
        });

        bb.on("error", reject);
        bb.on("finish", () => Promise.all(pending).then(resolve).catch(reject));
        req.pipe(bb);
      });
    } catch (err) {
      parseError = err;
    }

    if (parseError) {
      console.error("admin release upload: parse error", parseError);
      return res.status(500).json({ error: "Upload failed" });
    }

    if (!albumName) {
      return res.status(400).json({ error: "albumName is required" });
    }

    if (savedTracks.length === 0) {
      return res.status(400).json({ error: "No valid track files uploaded" });
    }

    // Validate release date
    let finalReleaseDate = releaseDate;
    if (!finalReleaseDate && releaseNotes) {
      // Try to parse from notes
      const { parseReleaseDateFromNotes } = await import("../../scripts/release-pipeline/shared.mjs");
      finalReleaseDate = parseReleaseDateFromNotes(releaseNotes) || "";
    }

    if (!finalReleaseDate) {
      return res.status(400).json({ error: "Release date is required (DD/MM/YYYY format)" });
    }

    // Validate date format DD/MM/YYYY
    const dateMatch = finalReleaseDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!dateMatch) {
      return res.status(400).json({ error: "Invalid release date format. Use DD/MM/YYYY" });
    }

    const day = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const year = Number(dateMatch[3]);
    if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900 || year > 2100) {
      return res.status(400).json({ error: "Invalid release date values" });
    }

    // Save release notes if provided
    if (releaseNotes) {
      try {
        const albumDir = path.join(ROOT, "public", "media", "music", albumName);
        const notesDir = path.join(albumDir, "notes");
        const notesPath = path.join(notesDir, "notes");
        await mkdir(notesDir, { recursive: true });
        await writeFile(notesPath, releaseNotes, "utf-8");
      } catch (err) {
        console.error("admin release upload: failed to save notes", err);
      }
    }

    // Save release metadata (type and date)
    try {
      const albumDir = path.join(ROOT, "public", "media", "music", albumName);
      const metaPath = path.join(albumDir, "release-meta.json");
      const meta = {
        releaseType: releaseType || "album",
        releaseDate: finalReleaseDate
      };
      await mkdir(albumDir, { recursive: true });
      await writeFile(metaPath, JSON.stringify(meta, null, 2), "utf-8");
    } catch (err) {
      console.error("admin release upload: failed to save metadata", err);
    }

    // Optimize media (HLS streams, previews, playlists) then regenerate manifests
    try {
      await optimizeAlbum(ROOT, albumName);
      const albums = await regenerateManifests();
      await service?.reload?.();

      // Generate MDX files for the new release (both locales)
      const newAlbum = albums.find(a => a.albumName === albumName);
      if (newAlbum) {
        await generateReleaseMdx(newAlbum).catch(err => {
          console.error("admin release upload: MDX generation failed", err);
        });
        await regenerateContentManifest().catch(err => {
          console.error("admin release upload: content manifest regeneration failed", err);
        });
      }

      // Rebuild static assets in background so the new release page is available
      silentRebuild();
    } catch (err) {
      console.error("admin release upload: pipeline failed", err);
      return res.status(500).json({ error: "Tracks saved but pipeline failed: " + err.message });
    }

    return res.status(200).json({ ok: true, albumName, releaseType, releaseDate: finalReleaseDate, tracks: savedTracks, cover: coverFileName });
  });

  // ── Background management ──────────────────────────────────────────────────
  const BG_DIR = path.join(ROOT, "public", "media", "background");
  const BG_OLD_DIR = path.join(BG_DIR, "old");
  const BG_VERSION_FILE = path.join(ROOT, "data", "bg-version.json");
  const BG_FILES = ["bg.jpg", "bg-960.avif", "bg-1440.avif", "bg-960.webp", "bg-1440.webp"];
  const BG_IMG_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

  async function readBgVersion() {
    try { return JSON.parse(await readFile(BG_VERSION_FILE, "utf8")); } catch { return { version: "20260425-1" }; }
  }
  async function writeBgVersion(v) {
    await mkdir(path.dirname(BG_VERSION_FILE), { recursive: true });
    await writeFile(BG_VERSION_FILE, JSON.stringify(v, null, 2));
    // Patch the CSS fallback so the loader screen shows the correct BG
    const baseCssPath = path.join(ROOT, "src", "styles", "modules", "base.css");
    try {
      const css = await readFile(baseCssPath, "utf8");
      const updated = css.replace(
        /background-image: var\(--bg-image, url\("\/media\/background\/bg\.jpg\?v=[^"]+"\)\);/,
        `background-image: var(--bg-image, url("/media/background/bg.jpg?v=${v.version}"));`
      );
      if (updated !== css) await writeFile(baseCssPath, updated, "utf8");
    } catch (error) {
      void error;
    }
  }

  // GET /api/admin/background — current bg info + old list
  router.get("/background", requireAdmin, async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const { version } = await readBgVersion();
      const oldEntries = [];
      try {
        const files = await readdir(BG_OLD_DIR);
        // Group by prefix (bg-<timestamp>)
        const prefixes = new Set(files.map(f => f.replace(/\.(jpg|avif|webp)$/, "").replace(/-960$|-1440$/, "")));
        for (const prefix of prefixes) {
          if (files.includes(`${prefix}.jpg`)) {
            oldEntries.push({ id: prefix, previewUrl: `/media/background/old/${prefix}.jpg` });
          }
        }
      } catch (error) {
        void error;
      }
      return res.json({ ok: true, version, oldBackgrounds: oldEntries });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/admin/background/upload — upload + optimize new BG, archive old
  router.post("/background/upload", enforceSameOrigin, requireAdmin, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const contentType = req.headers["content-type"] || "";
    if (!contentType.includes("multipart/form-data")) return res.status(400).json({ error: "Expected multipart/form-data" });

    let tmpPath = null;
    let parseError = null;
    try {
      await new Promise((resolve, reject) => {
        const bb = busboy({ headers: req.headers, limits: { fileSize: 100 * 1024 * 1024, files: 1 } });
        bb.on("file", (_field, stream, info) => {
          const ext = path.extname(info.filename).toLowerCase();
          if (!BG_IMG_EXT.has(ext)) { stream.resume(); return; }
          tmpPath = path.join(ROOT, "tmp", `bg-upload-${Date.now()}${ext}`);
          mkdir(path.dirname(tmpPath), { recursive: true }).then(() => {
            const ws = createWriteStream(tmpPath);
            stream.pipe(ws);
            ws.on("finish", resolve);
            ws.on("error", reject);
            stream.on("error", reject);
          }).catch(reject);
        });
        bb.on("error", reject);
        bb.on("finish", () => { if (!tmpPath) resolve(); });
        req.pipe(bb);
      });
    } catch (err) { parseError = err; }

    if (parseError || !tmpPath) {
      if (tmpPath) await rm(tmpPath, { force: true });
      return res.status(400).json({ error: parseError?.message || "No image uploaded" });
    }

    try {
      // Archive current BG to old/
      const { version: oldVersion } = await readBgVersion();
      await mkdir(BG_OLD_DIR, { recursive: true });
      for (const f of BG_FILES) {
        const src = path.join(BG_DIR, f);
        try {
          const ext = path.extname(f);
          const base = f.replace(ext, "");
          await copyFile(src, path.join(BG_OLD_DIR, `${base}-${oldVersion}${ext}`));
        } catch (error) {
          void error;
        }
      }

      // Generate new BG
      const { generateBg } = await import(`${ROOT}/scripts/generate-bg.mjs`);
      await generateBg(tmpPath);
      await rm(tmpPath, { force: true });

      // Update version
      const newVersion = `${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-1`;
      await writeBgVersion({ version: newVersion });

      // Auto-generate palette from new BG and activate it
      try {
        const { generatePalette } = await import(`${ROOT}/scripts/generate-palette.mjs`);
        const palette = await generatePalette(path.join(BG_DIR, "bg.jpg"), `bg-${newVersion}`);
        const palData = await readPalettes();
        palData.palettes.push(palette);
        palData.active = palette.id;
        await writePalettes(palData);
      } catch (palErr) {
        console.error("bg upload: palette generation failed (non-fatal)", palErr);
      }

      return res.json({ ok: true, version: newVersion });
    } catch (err) {
      await rm(tmpPath, { force: true }).catch(() => {});
      console.error("bg upload failed", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/admin/background/activate/:id — restore an old BG as current
  router.post("/background/activate/:id", enforceSameOrigin, requireAdmin, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const id = req.params.id?.replace(/[^a-z0-9-]/gi, "");
    if (!id) return res.status(400).json({ error: "Invalid id" });
    try {
      const { version: oldVersion } = await readBgVersion();
      await mkdir(BG_OLD_DIR, { recursive: true });
      // Archive current
      for (const f of BG_FILES) {
        const src = path.join(BG_DIR, f);
        try {
          const ext = path.extname(f);
          const base = f.replace(ext, "");
          await copyFile(src, path.join(BG_OLD_DIR, `${base}-${oldVersion}${ext}`));
        } catch (error) {
          void error;
        }
      }
      // Restore old
      for (const f of BG_FILES) {
        const ext = path.extname(f);
        const base = f.replace(ext, "");
        const oldFile = path.join(BG_OLD_DIR, `${base}-${id}${ext}`);
        try {
          await copyFile(oldFile, path.join(BG_DIR, f));
        } catch (error) {
          void error;
        }
      }
      const newVersion = `${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-1`;
      await writeBgVersion({ version: newVersion });
      // Auto-generate palette for restored BG
      try {
        const { generatePalette } = await import(`${ROOT}/scripts/generate-palette.mjs`);
        const palette = await generatePalette(path.join(BG_DIR, "bg.jpg"), `bg-${id}`);
        const palData = await readPalettes();
        palData.palettes.push(palette);
        palData.active = palette.id;
        await writePalettes(palData);
      } catch (error) {
        void error;
      }
      return res.json({ ok: true, version: newVersion });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/admin/background/old/:id — permanently delete an old BG set
  router.delete("/background/old/:id", enforceSameOrigin, requireAdmin, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const id = req.params.id?.replace(/[^a-z0-9-]/gi, "");
    if (!id) return res.status(400).json({ error: "Invalid id" });
    try {
      const files = await readdir(BG_OLD_DIR).catch(() => []);
      for (const f of files) {
        if (f.includes(`-${id}.`) || f.endsWith(`-${id}`)) {
          await rm(path.join(BG_OLD_DIR, f), { force: true });
        }
      }
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Palette management ─────────────────────────────────────────────────────
  const PALETTES_FILE = path.join(ROOT, "data", "palettes.json");

  async function readPalettes() {
    try {
      const parsed = JSON.parse(await readFile(PALETTES_FILE, "utf8"));
      return {
        enabled: parsed.enabled === true,
        active: typeof parsed.active === "string" ? parsed.active : null,
        palettes: Array.isArray(parsed.palettes) ? parsed.palettes : []
      };
    } catch {
      return { enabled: false, active: null, palettes: [] };
    }
  }
  async function writePalettes(data) {
    await mkdir(path.dirname(PALETTES_FILE), { recursive: true });
    await writeFile(PALETTES_FILE, JSON.stringify(data, null, 2));
  }

  // GET /api/admin/palette — list palettes
  router.get("/palette", requireAdmin, async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    return res.json({ ok: true, ...(await readPalettes()) });
  });

  router.post("/palette/enabled", enforceSameOrigin, requireAdmin, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const enabled = Boolean(req.body?.enabled);
      const data = await readPalettes();
      data.enabled = enabled && data.palettes.length > 0;
      if (!data.enabled) {
        data.active = null;
      } else if (!data.active) {
        data.active = data.palettes[0]?.id ?? null;
      }
      await writePalettes(data);
      return res.json({ ok: true, enabled: data.enabled, active: data.active });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/admin/palette/generate — extract palette from current (or uploaded) BG
  router.post("/palette/generate", enforceSameOrigin, requireAdmin, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const bgId = typeof req.body?.bgId === "string" ? req.body.bgId.trim() : null;
    try {
      const { generatePalette } = await import(`${ROOT}/scripts/generate-palette.mjs`);
      let imagePath = path.join(BG_DIR, "bg.jpg");
      if (bgId) {
        const candidate = path.join(BG_OLD_DIR, `bg-${bgId}.jpg`);
        try {
          await readFile(candidate);
          imagePath = candidate;
        } catch (error) {
          void error;
        }
      }
      const palette = await generatePalette(imagePath, name || `palette-${Date.now()}`);
      const data = await readPalettes();
      data.palettes.push(palette);
      if (!data.active) data.active = palette.id;
      if (data.palettes.length === 1) data.enabled = true;
      await writePalettes(data);
      return res.json({ ok: true, palette });
    } catch (err) {
      console.error("palette generate failed", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/admin/palette/activate/:id — set active palette (writes CSS vars)
  router.post("/palette/activate/:id", enforceSameOrigin, requireAdmin, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const id = req.params.id;
    try {
      const data = await readPalettes();
      const palette = data.palettes.find(p => p.id === id);
      if (!palette) return res.status(404).json({ error: "Palette not found" });
      data.active = id;
      data.enabled = true;
      await writePalettes(data);
      return res.json({ ok: true, palette });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/admin/palette/:id — update palette vars manually
  router.patch("/palette/:id", enforceSameOrigin, requireAdmin, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const id = req.params.id;
    try {
      const data = await readPalettes();
      const idx = data.palettes.findIndex(p => p.id === id);
      if (idx === -1) return res.status(404).json({ error: "Palette not found" });
      if (req.body?.name) data.palettes[idx].name = String(req.body.name).trim();
      if (req.body?.vars && typeof req.body.vars === "object") {
        data.palettes[idx].vars = { ...data.palettes[idx].vars, ...req.body.vars };
      }
      await writePalettes(data);
      return res.json({ ok: true, palette: data.palettes[idx] });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/admin/palette/:id
  router.delete("/palette/:id", enforceSameOrigin, requireAdmin, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const id = req.params.id;
    try {
      const data = await readPalettes();
      data.palettes = data.palettes.filter(p => p.id !== id);
      if (data.active === id) data.active = data.palettes[0]?.id ?? null;
      if (data.palettes.length === 0) {
        data.active = null;
        data.enabled = false;
      }
      await writePalettes(data);
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Content (blog / news) management ──────────────────────────────────────
  const CONTENT_MDX_ROOT = path.join(ROOT, "content", "mdx");
  const CONTENT_MEDIA_ROOT = path.join(ROOT, "public", "media");
  const CONTENT_MANIFEST = path.join(ROOT, "src", "generated", "content-manifest.json");
  const CONTENT_MEDIA_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif", ".mp4", ".webm", ".mp3", ".ogg", ".wav", ".flac"]);

  function parseFrontmatter(source) {
    const norm = source.replace(/^\uFEFF/, "");
    if (!norm.startsWith("---\n")) return { data: {}, content: norm.trim() };
    const end = norm.indexOf("\n---\n", 4);
    if (end === -1) return { data: {}, content: norm.trim() };
    const data = {};
    for (const line of norm.slice(4, end).split("\n")) {
      const sep = line.indexOf(":");
      if (sep === -1) continue;
      const k = line.slice(0, sep).trim();
      const v = line.slice(sep + 1).trim().replace(/^['"]|['"]$/g, "");
      if (k) data[k] = v;
    }
    return { data, content: norm.slice(end + 5).trim() };
  }

  function buildMdx({ title, slug, publishedAt, excerpt, content }) {
    return `---\ntitle: ${title}\nslug: ${slug}\npublishedAt: ${publishedAt}\nexcerpt: ${excerpt}\n---\n\n${content}\n`;
  }

  async function regenerateContentManifestFile() {
    const { buildContentManifest } = await import(`${ROOT}/scripts/generate-content.mjs`);
    const manifest = await buildContentManifest();
    await mkdir(path.dirname(CONTENT_MANIFEST), { recursive: true });
    await writeFile(CONTENT_MANIFEST, JSON.stringify(manifest, null, 2));
    return manifest;
  }

  async function listPosts(kind, lang) {
    const dir = path.join(CONTENT_MDX_ROOT, lang, kind);
    const posts = [];
    let files;
    try { files = await readdir(dir); } catch { return posts; }
    for (const f of files) {
      if (!f.endsWith(".mdx")) continue;
      const src = await readFile(path.join(dir, f), "utf8").catch(() => "");
      const { data, content } = parseFrontmatter(src);
      const slug = data.slug?.trim() || f.replace(/\.mdx$/, "");
      posts.push({ slug, title: data.title?.trim() || slug, excerpt: data.excerpt?.trim() || "", publishedAt: data.publishedAt?.trim() || "", content, lang, kind });
    }
    return posts.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  }

  // GET /api/admin/content/:kind — list posts (kind = blog | news)
  router.get("/content/:kind", requireAdmin, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const kind = req.params.kind === "news" ? "news" : "blog";
    try {
      const [en, ru] = await Promise.all([listPosts(kind, "en"), listPosts(kind, "ru")]);
      return res.json({ ok: true, posts: { en, ru } });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/admin/content/:kind — create post
  router.post("/content/:kind", enforceSameOrigin, requireAdmin, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const kind = req.params.kind === "news" ? "news" : "blog";
    const { slug, title, publishedAt, excerpt, content, lang } = req.body || {};
    if (!slug || !title || !lang) return res.status(400).json({ error: "slug, title, lang required" });
    const safeSlug = String(slug).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/--+/g, "-").replace(/^-|-$/g, "");
    const dir = path.join(CONTENT_MDX_ROOT, lang, kind);
    const filePath = path.join(dir, `${safeSlug}.mdx`);
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(filePath, buildMdx({ title: title || safeSlug, slug: safeSlug, publishedAt: publishedAt || new Date().toISOString().slice(0, 10), excerpt: excerpt || "", content: content || "" }));
      await regenerateContentManifestFile();
      return res.json({ ok: true, slug: safeSlug });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/admin/content/:kind/:lang/:slug — update post
  router.patch("/content/:kind/:lang/:slug", enforceSameOrigin, requireAdmin, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const kind = req.params.kind === "news" ? "news" : "blog";
    const lang = req.params.lang === "ru" ? "ru" : "en";
    const slug = req.params.slug?.replace(/[^a-z0-9-]/g, "");
    if (!slug) return res.status(400).json({ error: "Invalid slug" });
    const dir = path.join(CONTENT_MDX_ROOT, lang, kind);
    const filePath = path.join(dir, `${slug}.mdx`);
    try {
      const existing = await readFile(filePath, "utf8").catch(() => null);
      const { data } = existing ? parseFrontmatter(existing) : { data: {} };
      const { title, publishedAt, excerpt, content } = req.body || {};
      await writeFile(filePath, buildMdx({
        title: title ?? data.title ?? slug,
        slug,
        publishedAt: publishedAt ?? data.publishedAt ?? new Date().toISOString().slice(0, 10),
        excerpt: excerpt ?? data.excerpt ?? "",
        content: content ?? ""
      }));
      await regenerateContentManifestFile();
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/admin/content/:kind/:lang/:slug
  router.delete("/content/:kind/:lang/:slug", enforceSameOrigin, requireAdmin, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const kind = req.params.kind === "news" ? "news" : "blog";
    const lang = req.params.lang === "ru" ? "ru" : "en";
    const slug = req.params.slug?.replace(/[^a-z0-9-]/g, "");
    if (!slug) return res.status(400).json({ error: "Invalid slug" });
    try {
      await rm(path.join(CONTENT_MDX_ROOT, lang, kind, `${slug}.mdx`), { force: true });
      // Also remove media dir
      await rm(path.join(CONTENT_MEDIA_ROOT, kind, slug), { recursive: true, force: true });
      await regenerateContentManifestFile();
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/admin/content/:kind/:lang/:slug/media — upload media file
  router.post("/content/:kind/:lang/:slug/media", enforceSameOrigin, requireAdmin, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const kind = req.params.kind === "news" ? "news" : "blog";
    const slug = req.params.slug?.replace(/[^a-z0-9-]/g, "");
    if (!slug) return res.status(400).json({ error: "Invalid slug" });
    const contentType = req.headers["content-type"] || "";
    if (!contentType.includes("multipart/form-data")) return res.status(400).json({ error: "Expected multipart/form-data" });

    const mediaDir = path.join(CONTENT_MEDIA_ROOT, kind, slug);
    await mkdir(mediaDir, { recursive: true });

    const saved = [];
    let parseError = null;
    try {
      await new Promise((resolve, reject) => {
        const bb = busboy({ headers: req.headers, limits: { fileSize: 200 * 1024 * 1024, files: 10 } });
        const pending = [];
        bb.on("file", (_field, stream, info) => {
          const ext = path.extname(info.filename).toLowerCase();
          if (!CONTENT_MEDIA_EXT.has(ext)) { stream.resume(); return; }
          const safeName = `${Date.now()}-${info.filename.replace(/[^a-z0-9._-]/gi, "_")}`;
          const dest = path.join(mediaDir, safeName);
          const p = new Promise((r, j) => {
            const ws = createWriteStream(dest);
            stream.pipe(ws);
            ws.on("finish", () => { saved.push({ name: safeName, url: `/media/${kind}/${slug}/${safeName}`, ext }); r(); });
            ws.on("error", j);
            stream.on("error", j);
          });
          pending.push(p);
        });
        bb.on("error", reject);
        bb.on("finish", () => Promise.all(pending).then(resolve).catch(reject));
        req.pipe(bb);
      });
    } catch (err) { parseError = err; }

    if (parseError) return res.status(500).json({ error: parseError.message });
    return res.json({ ok: true, files: saved });
  });

  // DELETE /api/admin/content/:kind/:lang/:slug/media/:filename
  router.delete("/content/:kind/:lang/:slug/media/:filename", enforceSameOrigin, requireAdmin, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const kind = req.params.kind === "news" ? "news" : "blog";
    const slug = req.params.slug?.replace(/[^a-z0-9-]/g, "");
    const filename = req.params.filename?.replace(/[^a-z0-9._-]/gi, "");
    if (!slug || !filename) return res.status(400).json({ error: "Invalid params" });
    try {
      await rm(path.join(CONTENT_MEDIA_ROOT, kind, slug, filename), { force: true });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Shop product management ────────────────────────────────────────────────
  const SHOP_ROOT = path.join(ROOT, "public", "media", "shop");
  const SHOP_IMG_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

  function shopSlugify(value) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/--+/g, "-");
  }

  async function readProductJson(slug) {
    try {
      return JSON.parse(await readFile(path.join(SHOP_ROOT, slug, "product.json"), "utf-8"));
    } catch {
      return null;
    }
  }

  async function writeProductJson(slug, data) {
    const dir = path.join(SHOP_ROOT, slug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "product.json"), JSON.stringify(data, null, 2), "utf-8");
  }

  // GET /api/admin/shop — list all products
  router.get("/shop", requireAdmin, async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      let dirents = [];
      try {
        dirents = await readdir(SHOP_ROOT, { withFileTypes: true });
      } catch (error) {
        void error;
      }
      const products = [];
      for (const d of dirents) {
        if (!d.isDirectory()) continue;
        const data = await readProductJson(d.name);
        if (!data) continue;
        const images = Array.isArray(data.images) ? data.images : [];
        products.push({
          slug: d.name,
          title: data.title || "",
          category: data.category || "",
          price: data.price || 0,
          status: data.status || "available",
          quantity: data.quantity ?? 0,
          images,
          coverImage: data.coverImage || images[0] || null,
          description: data.description || { en: "", ru: "" }
        });
      }
      return res.json({ ok: true, products });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/admin/shop — create product (JSON only, no images yet)
  router.post("/shop", enforceSameOrigin, requireAdmin, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    if (!title) return res.status(400).json({ error: "title is required" });

    const slug = shopSlugify(title);
    if (!slug) return res.status(400).json({ error: "Invalid title" });

    const existing = await readProductJson(slug);
    if (existing) return res.status(409).json({ error: "Product with this slug already exists" });

    const data = {
      slug,
      title,
      category: typeof req.body?.category === "string" ? req.body.category.trim() : "",
      price: Math.floor(Number(req.body?.price) || 0),
      status: ["available", "sold_out", "coming_soon"].includes(req.body?.status) ? req.body.status : "available",
      quantity: Math.max(0, Math.floor(Number(req.body?.quantity) || 0)),
      images: [],
      coverImage: null,
      description: {
        en: typeof req.body?.descriptionEn === "string" ? req.body.descriptionEn : "",
        ru: typeof req.body?.descriptionRu === "string" ? req.body.descriptionRu : ""
      }
    };

    try {
      await writeProductJson(slug, data);
      await mkdir(path.join(SHOP_ROOT, slug, "images"), { recursive: true });
      await regenerateShopManifest();
      return res.json({ ok: true, slug });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/admin/shop/:slug — update product fields (JSON)
  router.patch("/shop/:slug", enforceSameOrigin, requireAdmin, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const slug = req.params.slug?.replace(/[^a-z0-9-]/g, "");
    if (!slug) return res.status(400).json({ error: "Invalid slug" });

    const data = await readProductJson(slug);
    if (!data) return res.status(404).json({ error: "Product not found" });

    if (typeof req.body?.title === "string") data.title = req.body.title.trim();
    if (typeof req.body?.category === "string") data.category = req.body.category.trim();
    if (req.body?.price !== undefined) data.price = Math.floor(Number(req.body.price) || 0);
    if (["available", "sold_out", "coming_soon"].includes(req.body?.status)) data.status = req.body.status;
    if (req.body?.quantity !== undefined) data.quantity = Math.max(0, Math.floor(Number(req.body.quantity) || 0));
    if (typeof req.body?.descriptionEn === "string") data.description = { ...data.description, en: req.body.descriptionEn };
    if (typeof req.body?.descriptionRu === "string") data.description = { ...data.description, ru: req.body.descriptionRu };
    if (typeof req.body?.coverImage === "string") {
      const imgs = Array.isArray(data.images) ? data.images : [];
      data.coverImage = imgs.includes(req.body.coverImage) ? req.body.coverImage : (imgs[0] ?? null);
    }
    // Reorder images
    if (Array.isArray(req.body?.images)) {
      const existing = new Set(Array.isArray(data.images) ? data.images : []);
      data.images = req.body.images.filter((f) => typeof f === "string" && existing.has(f));
    }

    try {
      await writeProductJson(slug, data);
      await regenerateShopManifest();
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/admin/shop/:slug — delete product
  router.delete("/shop/:slug", enforceSameOrigin, requireAdmin, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const slug = req.params.slug?.replace(/[^a-z0-9-]/g, "");
    if (!slug) return res.status(400).json({ error: "Invalid slug" });

    try {
      await rm(path.join(SHOP_ROOT, slug), { recursive: true, force: true });
      await regenerateShopManifest();
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/admin/shop/:slug/images — upload images (multipart)
  router.post("/shop/:slug/images", enforceSameOrigin, requireAdmin, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const slug = req.params.slug?.replace(/[^a-z0-9-]/g, "");
    if (!slug) return res.status(400).json({ error: "Invalid slug" });

    const data = await readProductJson(slug);
    if (!data) return res.status(404).json({ error: "Product not found" });

    const contentType = req.headers["content-type"] || "";
    if (!contentType.includes("multipart/form-data")) return res.status(400).json({ error: "Expected multipart/form-data" });

    const imagesDir = path.join(SHOP_ROOT, slug, "images");
    await mkdir(imagesDir, { recursive: true });

    const saved = [];
    let parseError = null;
    try {
      await new Promise((resolve, reject) => {
        const bb = busboy({ headers: req.headers, limits: { fileSize: 50 * 1024 * 1024, files: 20 } });
        const pending = [];
        bb.on("file", (_field, stream, info) => {
          const ext = path.extname(info.filename).toLowerCase();
          if (!SHOP_IMG_EXT.has(ext)) { stream.resume(); return; }
          const safeName = `${Date.now()}-${info.filename.replace(/[^a-z0-9._-]/gi, "_")}`;
          const dest = path.join(imagesDir, safeName);
          const p = new Promise((r, j) => {
            const ws = createWriteStream(dest);
            stream.pipe(ws);
            ws.on("finish", () => { saved.push(safeName); r(); });
            ws.on("error", j);
            stream.on("error", j);
          });
          pending.push(p);
        });
        bb.on("error", reject);
        bb.on("finish", () => Promise.all(pending).then(resolve).catch(reject));
        req.pipe(bb);
      });
    } catch (err) { parseError = err; }

    if (parseError) return res.status(500).json({ error: parseError.message });

    // Append new images to product
    if (!Array.isArray(data.images)) data.images = [];
    data.images.push(...saved);
    if (!data.coverImage && saved.length > 0) data.coverImage = saved[0];

    try {
      await writeProductJson(slug, data);
      await regenerateShopManifest();
      return res.json({ ok: true, uploaded: saved });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/admin/shop/:slug/images/:filename — delete one image
  router.delete("/shop/:slug/images/:filename", enforceSameOrigin, requireAdmin, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const slug = req.params.slug?.replace(/[^a-z0-9-]/g, "");
    const filename = req.params.filename?.replace(/[^a-z0-9._-]/gi, "");
    if (!slug || !filename) return res.status(400).json({ error: "Invalid params" });

    const data = await readProductJson(slug);
    if (!data) return res.status(404).json({ error: "Product not found" });

    try {
      await rm(path.join(SHOP_ROOT, slug, "images", filename), { force: true });
      data.images = (Array.isArray(data.images) ? data.images : []).filter((f) => f !== filename);
      if (data.coverImage === filename) data.coverImage = data.images[0] ?? null;
      await writeProductJson(slug, data);
      await regenerateShopManifest();
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  return router;
}
