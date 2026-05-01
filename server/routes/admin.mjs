import crypto from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
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
import { regenerateManifests } from "../lib/release-regenerator.mjs";

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
      await regenerateManifests();
      await service?.reload?.();
    } catch (err) {
      console.error("admin release upload: pipeline failed", err);
      return res.status(500).json({ error: "Tracks saved but pipeline failed: " + err.message });
    }

    return res.status(200).json({ ok: true, albumName, releaseType, releaseDate: finalReleaseDate, tracks: savedTracks, cover: coverFileName });
  });

  return router;
}

