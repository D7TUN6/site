import type { Lang } from "@/types/content";
import type { ShopMoney } from "@/types/shop";

const localeByLang: Record<Lang, string> = {
  en: "en-US",
  ru: "ru-RU"
};

export function formatShopMoney(money: ShopMoney, lang: Lang): string {
  const locale = localeByLang[lang] || "en-US";

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: money.currency,
      maximumFractionDigits: 0
    }).format(money.value);
  } catch {
    const fallbackSymbol = money.currency === "RUB" ? "₽" : money.currency;
    return `${money.value} ${fallbackSymbol}`;
  }
}

