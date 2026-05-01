export const SHOP_CURRENCY = "RUB";

// Store prices in minor units (kopeks) to avoid floats.
const PRODUCTS = [
  {
    slug: "wh1te-hous3-cd",
    title: "D7TUN6 — Wh1te Hous3 (CD)",
    unitAmount: 80000
  }
];

export function getAllProducts() {
  return PRODUCTS.map((product) => ({
    slug: product.slug,
    title: product.title,
    currency: SHOP_CURRENCY,
    unitAmount: product.unitAmount
  }));
}

export function getProductBySlug(slug) {
  return PRODUCTS.find((product) => product.slug === slug) ?? null;
}

