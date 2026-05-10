import { computed, reactive, watch } from "vue";

export type Theme = "dark" | "light";

const STORAGE_KEY = "d7tun6.site.theme.v1";

type ThemeState = {
  theme: Theme;
};

function isTheme(value: unknown): value is Theme {
  return value === "dark" || value === "light";
}

function readStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isTheme(raw) ? raw : null;
  } catch {
    return null;
  }
}

function resolveSystemTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    if (window.matchMedia?.("(prefers-color-scheme: light)").matches) {
      return "light";
    }
  } catch {
    // Ignore matchMedia issues.
  }
  return "dark";
}

function resolveInitialTheme(): Theme {
  if (typeof document !== "undefined") {
    const fromDom = document.documentElement.dataset.theme;
    if (isTheme(fromDom)) return fromDom;
  }

  const stored = readStoredTheme();
  return stored ?? resolveSystemTheme();
}

const state = reactive<ThemeState>({
  theme: resolveInitialTheme()
});

let isWatcherInstalled = false;
let isStorageListenerInstalled = false;

function applyThemeToDocument(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
}

function saveTheme(theme: Theme): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Ignore storage failures.
  }
}

function installStorageListenerOnce(): void {
  if (isStorageListenerInstalled) return;
  if (typeof window === "undefined") return;

  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    if (!isTheme(event.newValue)) return;
    state.theme = event.newValue;
    applyThemeToDocument(state.theme);
  });

  isStorageListenerInstalled = true;
}

export function useTheme() {
  installStorageListenerOnce();

  if (!isWatcherInstalled) {
    isWatcherInstalled = true;

    watch(
      () => state.theme,
      (next) => {
        applyThemeToDocument(next);
        saveTheme(next);
      },
      { immediate: true }
    );
  }

  const theme = computed(() => state.theme);

  function setTheme(next: Theme): void {
    state.theme = next;
  }

  function toggleTheme(): void {
    state.theme = state.theme === "dark" ? "light" : "dark";
  }

  return {
    theme,
    setTheme,
    toggleTheme
  };
}

