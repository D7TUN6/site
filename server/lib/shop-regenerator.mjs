import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");

const SHOP_ROOT = path.join(ROOT, "public", "media", "shop");
const MANIFEST_PATH = path.join(ROOT, "src", "generated", "shop-manifest.json");

export async function regenerateShopManifest() {
  const products = [];

  let dirents = [];
  try {
    dirents = await readdir(SHOP_ROOT, { withFileTypes: true });
  } catch {
    // shop dir may not exist yet
  }

  for (const d of dirents) {
    if (!d.isDirectory()) continue;
    const slug = d.name;
    const productJsonPath = path.join(SHOP_ROOT, slug, "product.json");
    let data;
    try {
      data = JSON.parse(await readFile(productJsonPath, "utf-8"));
    } catch {
      continue;
    }

    const images = Array.isArray(data.images) ? data.images : [];
    const coverImage = typeof data.coverImage === "string" && data.coverImage
      ? data.coverImage
      : images[0] ?? null;

    products.push({
      slug,
      title: String(data.title || ""),
      category: String(data.category || ""),
      price: { currency: "RUB", value: Math.floor(Number(data.price) / 100) },
      unitAmount: Math.floor(Number(data.price) || 0),
      status: String(data.status || "available"),
      quantity: Number.isFinite(data.quantity) ? Math.max(0, Math.floor(data.quantity)) : 0,
      images: images.map((f) => `/media/shop/${slug}/images/${f}`),
      coverUrl: coverImage ? `/media/shop/${slug}/images/${coverImage}` : null,
      coverPreviewUrl: coverImage ? `/media/shop/${slug}/images/${coverImage}` : null,
      descriptionMarkdown: String(data.description?.ru || data.description?.en || ""),
      description: {
        en: String(data.description?.en || ""),
        ru: String(data.description?.ru || "")
      }
    });
  }

  await mkdir(path.dirname(MANIFEST_PATH), { recursive: true });
  await writeFile(MANIFEST_PATH, JSON.stringify({ products }, null, 2), "utf-8");
  return products;
}
