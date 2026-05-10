import type { Lang } from "@/types/content";

export const PREFERRED_LANGUAGE_STORAGE_KEY = "preferred-language";

function isLang(value: unknown): value is Lang {
  return value === "en" || value === "ru";
}

export function readPreferredLanguage(): Lang | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(PREFERRED_LANGUAGE_STORAGE_KEY);
    return isLang(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function resolvePreferredLanguage(): Lang {
  const stored = readPreferredLanguage();
  if (stored) {
    return stored;
  }

  if (typeof navigator !== "undefined") {
    const locales = [...navigator.languages, navigator.language].filter(
      (value): value is string => typeof value === "string" && value.length > 0
    );

    if (locales.some((value) => value.toLowerCase().startsWith("ru"))) {
      return "ru";
    }
  }

  return "en";
}

export function persistPreferredLanguage(lang: Lang): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(PREFERRED_LANGUAGE_STORAGE_KEY, lang);
  } catch {
    // Ignore storage failures and keep navigation working.
  }
}
