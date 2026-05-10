import type { Lang, LocaleDictionary } from "@/types/content";

import enLocaleSource from "@/locales/en.xml?raw";
import ruLocaleSource from "@/locales/ru.xml?raw";

const localeCache = new Map<Lang, Promise<LocaleDictionary>>();

const localeSourceByLang: Record<Lang, string> = {
  en: enLocaleSource,
  ru: ruLocaleSource
};

function isLocaleDictionary(input: unknown): input is LocaleDictionary {
  if (!input || typeof input !== "object") {
    return false;
  }

  const candidate = input as Partial<LocaleDictionary>;
  return Boolean(
    candidate.site?.title &&
      candidate.nav?.main &&
      candidate.nav?.bio &&
      candidate.nav?.music &&
      candidate.nav?.news &&
      candidate.nav?.blog &&
      candidate.nav?.links &&
      candidate.nav?.shop &&
      candidate.nav?.projects &&
      candidate.loader?.detecting &&
      candidate.loader?.fallback &&
      candidate.loader?.english &&
      candidate.loader?.russian
  );
}

async function loadLocale(lang: Lang): Promise<LocaleDictionary> {
  const source = localeSourceByLang[lang];
  const document = new DOMParser().parseFromString(source, "application/xml");
  const parserError = document.querySelector("parsererror");
  if (parserError) {
    throw new Error(`Invalid locale XML for ${lang}`);
  }

  const localeNode = document.querySelector("locale");
  const text = (selector: string) => localeNode?.querySelector(selector)?.textContent?.trim() ?? "";
  const parsed = {
    locale: {
      site: {
        title: text("site > title")
      },
      nav: {
        main: text("nav > main"),
        bio: text("nav > bio"),
        music: text("nav > music"),
        news: text("nav > news"),
        blog: text("nav > blog"),
        links: text("nav > links"),
        shop: text("nav > shop"),
        projects: text("nav > projects")
      },
      loader: {
        detecting: text("loader > detecting"),
        fallback: text("loader > fallback"),
        english: text("loader > english"),
        russian: text("loader > russian")
      }
    }
  } as const;

  if (!isLocaleDictionary(parsed.locale)) {
    throw new Error(`Invalid locale schema for ${lang}`);
  }

  return parsed.locale;
}

export function getLocaleDictionary(lang: Lang): Promise<LocaleDictionary> {
  const cached = localeCache.get(lang);
  if (cached) return cached;

  const promise = loadLocale(lang).catch((error) => {
    localeCache.delete(lang);
    throw error;
  });
  localeCache.set(lang, promise);
  return promise;
}
