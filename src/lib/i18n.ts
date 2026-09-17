import type { Lang, LocaleDictionary } from "@/types/content";

import enLocaleSource from "@/locales/en.xml?raw";
import ruLocaleSource from "@/locales/ru.xml?raw";

const localeCache = new Map<Lang, Promise<LocaleDictionary>>();

const localeSourceByLang: Record<Lang, string> = {
  en: enLocaleSource,
  ru: ruLocaleSource
};

function txt(n: Element | null, sel: string): string {
  return n?.querySelector(sel)?.textContent?.trim() ?? "";
}

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
      candidate.nav?.donate &&
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
    const a = (sel: string) => txt(localeNode, sel);
    const o = (section: string, key: string) => a(`${section} > ${key}`);
    const audioKeys = ["heading", "quality", "equalizer", "effects", "bitcrusher", "delay", "reverb", "chorus", "comb", "tape", "preset", "bitDepth", "reduction", "mix", "feedback", "time", "enabled", "tabQuality", "tabEq", "tabEffects", "headphoneComp", "searchHeadphones", "resetAutoEq", "autoEqLabel", "killSwitch", "panic", "tapeEmulation", "saturation", "bias", "noise", "wow", "flutter", "deckMechanism", "wear", "chewTape", "dolbyC", "wetDry", "lofiFx", "combFilter", "delayMs", "resonance", "rate", "depth", "dubDelay", "close"] as const;
    const adminKeys = ["articles", "gallery", "releases", "videos", "shop", "submissions", "pages", "create", "edit", "delete", "save", "cancel", "title", "content", "date", "slug", "excerpt", "search", "category", "artist", "tags"] as const;
    const hasAudio = localeNode.querySelector("audio");
    const hasAdmin = localeNode.querySelector("admin");
    const audio = hasAudio ? {} as Record<string, string> : undefined;
    const admin = hasAdmin ? {} as Record<string, string> : undefined;
    if (audio) for (const k of audioKeys) { const v = o("audio", k); if (v) audio[k] = v }
    if (admin) for (const k of adminKeys) { const v = o("admin", k); if (v) admin[k] = v }

    const parsed = {
      locale: {
        site: {
          title: a("site > title")
        },
        nav: {
          main: a("nav > main"),
          bio: a("nav > bio"),
          music: a("nav > music"),
          news: a("nav > news"),
          blog: a("nav > blog"),
          links: a("nav > links"),
          donate: a("nav > donate"),
          shop: a("nav > shop"),
          projects: a("nav > projects"),
          gallery: a("nav > gallery"),
          video: a("nav > video"),
          radio: a("nav > radio")
        },
        loader: {
          detecting: a("loader > detecting"),
          fallback: a("loader > fallback"),
          english: a("loader > english"),
          russian: a("loader > russian")
        },
        ...(audio ? { audio } : {}),
        ...(admin ? { admin } : {})
      }
    } as const;

    if (!isLocaleDictionary(parsed.locale)) return null;
    return parsed.locale;
  } catch {
    console.warn('Failed to parse locale dictionary')
    return null;
  }
}

export function t(section: Record<string, string> | undefined, key: string, fallback: string): string {
  return section?.[key] ?? fallback
}

export function getLocaleDictionarySync(lang: Lang): LocaleDictionary | null {
  const cached = localeCache.get(lang);
  if (cached) return null;
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
