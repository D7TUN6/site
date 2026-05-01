import type { Lang } from "@/types/content";
import type { ShopMoney, ShopProduct, ShopProductDetails } from "@/types/shop";

import enWh1teHous3CdSource from "../../content/mdx/en/shop/wh1te-hous3-cd.mdx?raw";
import ruWh1teHous3CdSource from "../../content/mdx/ru/shop/wh1te-hous3-cd.mdx?raw";

function cleanupMarkdown(source: string): string {
  return source
    .replace(/^import\s+.+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function rub(value: number): ShopMoney {
  return { currency: "RUB", value };
}

type ProductEntry = ShopProduct & {
  descriptionMarkdownByLang: Record<Lang, string>;
};

const PRODUCTS: ProductEntry[] = [
  {
    slug: "wh1te-hous3-cd",
    title: 'D7TUN6 — Wh1te Hous3 (CD)',
    category: "cd",
    price: rub(800),
    coverUrl: "/media/music/Wh1te Hous3/cover/cover.jpg",
    coverPreviewUrl: "/media/music/Wh1te Hous3/cover/cover-preview.webp",
    descriptionMarkdownByLang: {
      en: cleanupMarkdown(enWh1teHous3CdSource),
      ru: cleanupMarkdown(ruWh1teHous3CdSource)
    }
  }
];

export function getAllShopProducts(): ShopProduct[] {
  return PRODUCTS.map((product) => ({
    slug: product.slug,
    title: product.title,
    category: product.category,
    price: product.price,
    coverUrl: product.coverUrl,
    coverPreviewUrl: product.coverPreviewUrl
  }));
}

export function getShopProductDetails(lang: Lang, slug: string): ShopProductDetails | null {
  const product = PRODUCTS.find((entry) => entry.slug === slug);
  if (!product) return null;

  const descriptionMarkdown = product.descriptionMarkdownByLang[lang] || "";
  return {
    slug: product.slug,
    title: product.title,
    category: product.category,
    price: product.price,
    coverUrl: product.coverUrl,
    coverPreviewUrl: product.coverPreviewUrl,
    lang,
    descriptionMarkdown
  };
}
