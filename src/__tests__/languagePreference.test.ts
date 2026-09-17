
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'bun:test'
import { readPreferredLanguage, resolvePreferredLanguage, persistPreferredLanguage, PREFERRED_LANGUAGE_STORAGE_KEY } from '@/lib/languagePreference'

beforeEach(() => {
  if (typeof window !== 'undefined') {
    window.localStorage.clear()
  }
})

describe('readPreferredLanguage', () => {
  it('returns null when window is undefined', () => {
    const desc = Object.getOwnPropertyDescriptor(globalThis, 'window')
    Object.defineProperty(globalThis, 'window', { value: undefined, configurable: true })
    expect(readPreferredLanguage()).toBeNull()
    if (desc) Object.defineProperty(globalThis, 'window', desc)
  })

  it('returns null when no stored preference', () => {
    expect(readPreferredLanguage()).toBeNull()
  })

  it('returns "en" when stored', () => {
    window.localStorage.setItem(PREFERRED_LANGUAGE_STORAGE_KEY, 'en')
    expect(readPreferredLanguage()).toBe('en')
  })

  it('returns "ru" when stored', () => {
    window.localStorage.setItem(PREFERRED_LANGUAGE_STORAGE_KEY, 'ru')
    expect(readPreferredLanguage()).toBe('ru')
  })

  it('returns null for invalid stored value', () => {
    window.localStorage.setItem(PREFERRED_LANGUAGE_STORAGE_KEY, 'fr')
    expect(readPreferredLanguage()).toBeNull()
  })
})

describe('resolvePreferredLanguage', () => {
  it('returns stored preference when available', () => {
    window.localStorage.setItem(PREFERRED_LANGUAGE_STORAGE_KEY, 'ru')
    expect(resolvePreferredLanguage()).toBe('ru')
  })

  it('returns "en" when no preference and navigator has no Russian', () => {
    const desc = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    Object.defineProperty(globalThis, 'navigator', {
      value: { languages: ['en-US', 'en'], language: 'en-US' },
      configurable: true,
    })
    expect(resolvePreferredLanguage()).toBe('en')
    if (desc) Object.defineProperty(globalThis, 'navigator', desc)
  })

  it('returns "ru" when navigator language starts with "ru"', () => {
    const desc = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    Object.defineProperty(globalThis, 'navigator', {
      value: { languages: ['ru-RU', 'ru'], language: 'ru-RU' },
      configurable: true,
    })
    expect(resolvePreferredLanguage()).toBe('ru')
    if (desc) Object.defineProperty(globalThis, 'navigator', desc)
  })

  it('returns "en" when navigator is undefined', () => {
    const desc = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    Object.defineProperty(globalThis, 'navigator', { value: undefined, configurable: true })
    expect(resolvePreferredLanguage()).toBe('en')
    if (desc) Object.defineProperty(globalThis, 'navigator', desc)
  })
})

describe('persistPreferredLanguage', () => {
  it('stores language preference', () => {
    persistPreferredLanguage('ru')
    expect(window.localStorage.getItem(PREFERRED_LANGUAGE_STORAGE_KEY)).toBe('ru')
  })

  it('overwrites previous preference', () => {
    persistPreferredLanguage('ru')
    persistPreferredLanguage('en')
    expect(window.localStorage.getItem(PREFERRED_LANGUAGE_STORAGE_KEY)).toBe('en')
  })

  it('does not throw when window is undefined', () => {
    const origWindow = globalThis.window
    delete (globalThis as { window?: unknown }).window
    expect(() => persistPreferredLanguage('en')).not.toThrow()
    ;(globalThis as { window?: unknown }).window = origWindow
  })
})
