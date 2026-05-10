import type { Lang } from "@/types/content";

export type ShopCurrency = "RUB";

export type ShopMoney = {
  currency: ShopCurrency;
  value: number;
};

export type ShopProductStatus = "available" | "sold_out" | "coming_soon";

export type ShopProduct = {
  slug: string;
  title: string;
  category: string;
  price: ShopMoney;
  status: ShopProductStatus;
  quantity: number;
  images: string[];
  coverUrl: string | null;
  coverPreviewUrl: string | null;
};

export type ShopProductDetails = ShopProduct & {
  lang: Lang;
  descriptionMarkdown: string;
};
