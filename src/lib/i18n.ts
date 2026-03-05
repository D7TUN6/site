import { XMLParser } from "fast-xml-parser";
import type { Lang } from "@/lib/content";

export type LocaleDictionary = {
  site: {
    title: string;
  };
  nav: {
    main: string;
    bio: string;
    git: string;
    music: string;
    news: string;
    blog: string;
    links: string;
  };
  loader: {
    detecting: string;
    fallback: string;
    english: string;
    russian: string;
  };
};

const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: true,
  trimValues: true
});

const localeCache = new Map<Lang, Promise<LocaleDictionary>>();

function isLocaleDictionary(input: unknown): input is LocaleDictionary {
  if (!input || typeof input !== "object") {
    return false;
  }

  const candidate = input as Partial<LocaleDictionary>;
  return Boolean(
    candidate.site?.title &&
      candidate.nav?.main &&
      candidate.nav?.bio &&
      candidate.nav?.git &&
      candidate.nav?.music &&
      candidate.nav?.news &&
      candidate.nav?.blog &&
      candidate.nav?.links &&
      candidate.loader?.detecting &&
      candidate.loader?.fallback &&
      candidate.loader?.english &&
      candidate.loader?.russian
  );
}

async function loadLocale(lang: Lang): Promise<LocaleDictionary> {
  const response = await fetch(`/locales/${lang}.xml`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Failed to load locale ${lang}`);
  }

  const source = await response.text();
  const parsed = parser.parse(source) as { locale?: unknown };

  if (!isLocaleDictionary(parsed.locale)) {
    throw new Error(`Invalid locale schema for ${lang}`);
  }

  return parsed.locale;
}

export function getLocaleDictionary(lang: Lang): Promise<LocaleDictionary> {
  const cached = localeCache.get(lang);
  if (cached) {
    return cached;
  }

  const promise = loadLocale(lang);
  localeCache.set(lang, promise);
  return promise;
}
