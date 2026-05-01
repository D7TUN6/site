import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { enforceSameOrigin } from "../lib/request-origin.mjs";
import { PublicRequestError } from "../lib/release-download-service.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const MANIFEST_PATH = path.join(ROOT, "src", "generated", "release-manifest.json");

function isClientError(error) {
  return error instanceof PublicRequestError;
}

export function createReleaseRouter({ service }) {
  const router = express.Router();

  router.get("/manifest", async (_req, res) => {
    try {
      const raw = await readFile(MANIFEST_PATH, "utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", "application/json");
      return res.status(200).send(raw);
    } catch (err) {
      console.error("releases manifest read failed", err);
      return res.status(500).json({ error: "Unable to read manifest" });
    }
  });

  router.post("/download", enforceSameOrigin, async (req, res) => {
    try {
      const slug = typeof req.body?.slug === "string" ? req.body.slug : null;
      const format = typeof req.body?.format === "string" ? req.body.format : null;
      service.validateReleaseRequest(slug, format);
      const release = service.getReleaseOrThrow(slug);
      const downloadUrl = await service.ensureReleaseArchiveCached(release, format);
      res.setHeader("Cache-Control", "no-store");
      return res.redirect(302, downloadUrl);
    } catch (error) {
      if (isClientError(error)) {
        return res.status(error.status).json({ error: error.message });
      }

      console.error("release archive request failed", error);
      if (!res.headersSent) {
        return res.status(500).json({ error: "Unable to process download" });
      }
    }
  });

  router.get("/download", (_req, res) => {
    res.status(405).json({ error: "Use POST /api/releases/download" });
  });

  router.post("/track", enforceSameOrigin, async (req, res) => {
    try {
      const slug = typeof req.body?.slug === "string" ? req.body.slug : null;
      const trackIndexRaw = typeof req.body?.track === "string" ? req.body.track : null;
      const format = typeof req.body?.format === "string" ? req.body.format : null;
      service.validateTrackRequest(slug, trackIndexRaw, format);
      const release = service.getReleaseOrThrow(slug);
      const track = service.getTrackOrThrow(release, trackIndexRaw, format);
      const downloadUrl = await service.ensureTrackDownloadCached(release, track, format);
      res.setHeader("Cache-Control", "no-store");
      return res.redirect(302, downloadUrl);
    } catch (error) {
      if (isClientError(error)) {
        return res.status(error.status).json({ error: error.message });
      }

      console.error("track download request failed", error);
      return res.status(500).json({ error: "Unable to process download" });
    }
  });

  router.get("/track", (_req, res) => {
    res.status(405).json({ error: "Use POST /api/releases/track" });
  });

  return router;
}
