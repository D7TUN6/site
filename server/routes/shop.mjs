import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const MANIFEST_PATH = path.join(ROOT, "src", "generated", "shop-manifest.json");

export function createShopRouter() {
  const router = express.Router();

  router.get("/manifest", async (_req, res) => {
    try {
      const raw = await readFile(MANIFEST_PATH, "utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", "application/json");
      return res.status(200).send(raw);
    } catch {
      return res.status(200).json({ products: [] });
    }
  });

  return router;
}
