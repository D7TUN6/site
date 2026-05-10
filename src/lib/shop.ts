import type { Lang } from "@/types/content";
import type { ShopProduct, ShopProductDetails } from "@/types/shop";
import staticManifest from "@/generated/shop-manifest.json";

type ManifestProduct = ShopProduct & {
  unitAmount?: number;
  descriptionMarkdown?: string;
  description?: { en?: string; ru?: string };
};

type ShopManifest = { products: ManifestProduct[] };

const typedManifest = staticManifest as ShopManifest;

const productBySlug = new Map<string, ManifestProduct>(
  typedManifest.products.map((p) => [p.slug, p])
);

export function getAllShopProducts(): ShopProduct[] {
  return typedManifest.products;
}

export function getShopProductDetails(lang: Lang, slug: string): ShopProductDetails | null {
  const product = productBySlug.get(slug);
  if (!product) return null;
  const descriptionMarkdown = product.description?.[lang] ?? product.descriptionMarkdown ?? "";
  return { ...product, lang, descriptionMarkdown };
}

export async function fetchLiveShopManifest(): Promise<ShopManifest> {
  const res = await fetch("/api/shop/manifest");
  if (!res.ok) throw new Error(`Failed to fetch shop manifest: ${res.status}`);
  return res.json() as Promise<ShopManifest>;
}
