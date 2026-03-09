import express from "express";
import { enforceSameOrigin } from "../lib/request-origin.mjs";
import { PublicRequestError } from "../lib/release-download-service.mjs";

function isClientError(error) {
  return error instanceof PublicRequestError;
}

export function createReleaseRouter({ service }) {
  const router = express.Router();

  router.post("/download", enforceSameOrigin, async (req, res) => {
    try {
      const slug = typeof req.body?.slug === "string" ? req.body.slug : null;
      const format = typeof req.body?.format === "string" ? req.body.format : null;
      service.validateReleaseRequest(slug, format);
      const release = service.getReleaseOrThrow(slug);
      await service.streamReleaseArchive(res, release, format);
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
      const download = service.getTrackDownload(release, track, format);

      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Disposition", `attachment; filename="${download.fileName}"`);
      return res.download(download.filePath, download.fileName);
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
