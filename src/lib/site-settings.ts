import { applyTier, getDeviceTier, TIER_KEY, type DeviceTier } from './perf/tier-detector'

export const SITE_SETTINGS_KEY = 'd7tun6-site-settings'
export const LEGACY_THEME_KEY = 'd7tun6.theme.v1'

export type SiteTheme = 'dark' | 'light'
export type SiteSettings = {
  theme: SiteTheme
  tier: DeviceTier
  effects: boolean
  a11y: boolean
}

const DEFAULT_SETTINGS: SiteSettings = { theme: 'dark', tier: 3, effects: true, a11y: false }

function isTier(v: unknown): v is DeviceTier {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 4
}

export function loadSiteSettings(): SiteSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS
  let theme: SiteTheme = DEFAULT_SETTINGS.theme
  try {
    const raw = window.localStorage.getItem(SITE_SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SiteSettings>
      theme = parsed.theme === 'light' ? 'light' : 'dark'
      return {
        theme,
        tier: isTier(parsed.tier) ? parsed.tier : getDeviceTier(),
        effects: typeof parsed.effects === 'boolean' ? parsed.effects : true,
        a11y: parsed.a11y === true,
      }
    }
    theme = window.localStorage.getItem(LEGACY_THEME_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    // fall through
  }
  return { ...DEFAULT_SETTINGS, theme, tier: getDeviceTier() }
}

export function saveSiteSettings(settings: SiteSettings): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SITE_SETTINGS_KEY, JSON.stringify(settings))
    window.localStorage.setItem(LEGACY_THEME_KEY, settings.theme)
    window.localStorage.setItem(TIER_KEY, String(settings.tier))
  } catch {
    // ignore — private mode or storage full
  }
}

export function applySiteSettings(settings: SiteSettings): void {
  const root = document.documentElement
  root.dataset.theme = settings.theme
  applyTier(settings.tier)
  root.classList.toggle('effects-off', !settings.effects)
  root.classList.toggle('a11y-on', settings.a11y)
}
