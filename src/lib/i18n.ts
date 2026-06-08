import type { Lang, LocaleDictionary } from "@/types/content";

import enLocaleSource from "@/locales/en.xml?raw";
import ruLocaleSource from "@/locales/ru.xml?raw";

const localeCache = new Map<Lang, Promise<LocaleDictionary>>();

const localeSourceByLang: Record<Lang, string> = {
  en: enLocaleSource,
  ru: ruLocaleSource
};

export function isLocaleDictionary(input: unknown): input is LocaleDictionary {
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
      candidate.nav?.gallery &&
      candidate.nav?.video &&
      candidate.nav?.radio &&
      candidate.loader?.detecting &&
      candidate.loader?.fallback &&
      candidate.loader?.english &&
      candidate.loader?.russian
  );
}

function parseLocale(lang: Lang): LocaleDictionary | null {
  const source = localeSourceByLang[lang];
  if (!source) return null;
  try {
    const document = new DOMParser().parseFromString(source, "application/xml");
    const parserError = document.querySelector("parsererror");
    if (parserError) return null;

    const localeNode = document.querySelector("locale");
    if (!localeNode) return null;
    const text = (selector: string) => localeNode.querySelector(selector)?.textContent?.trim() ?? "";
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
          projects: text("nav > projects"),
          gallery: text("nav > gallery"),
          video: text("nav > video"),
          radio: text("nav > radio")
        },
        loader: {
          detecting: text("loader > detecting"),
          fallback: text("loader > fallback"),
          english: text("loader > english"),
          russian: text("loader > russian")
        }
      }
    } as const;

    if (!isLocaleDictionary(parsed.locale)) return null;
    return parsed.locale;
  } catch {
    return null;
  }
}

export function getLocaleDictionarySync(lang: Lang): LocaleDictionary | null {
  return parseLocale(lang);
}

async function loadLocale(lang: Lang): Promise<LocaleDictionary> {
  const parsed = parseLocale(lang);
  if (!parsed) throw new Error(`Invalid locale XML for ${lang}`);
  return parsed;
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
