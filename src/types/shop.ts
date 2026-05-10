import type { Lang } from "@/types/content";

export type ShopCurrency = "RUB";

export type ShopMoney = {
  currency: ShopCurrency;
  value: number;
};

export type ShopProductCategory = "cd";

export type ShopProduct = {
  slug: string;
  title: string;
  category: ShopProductCategory;
  price: ShopMoney;
  coverUrl: string;
  coverPreviewUrl: string | null;
};

export type ShopProductDetails = ShopProduct & {
  lang: Lang;
  descriptionMarkdown: string;
};
