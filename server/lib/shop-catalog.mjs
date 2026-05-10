import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");

export const SHOP_CURRENCY = "RUB";

const MANIFEST_PATH = path.join(ROOT, "src", "generated", "shop-manifest.json");

async function loadManifest() {
  try {
    const raw = await readFile(MANIFEST_PATH, "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data.products) ? data.products : [];
  } catch {
    return [];
  }
}

export async function getAllProducts() {
  const products = await loadManifest();
  return products.map((p) => ({
    slug: p.slug,
    title: p.title,
    currency: SHOP_CURRENCY,
    unitAmount: p.unitAmount ?? Math.round((p.price?.value ?? 0) * 100)
  }));
}

export async function getProductBySlug(slug) {
  const products = await loadManifest();
  return products.find((p) => p.slug === slug) ?? null;
}
