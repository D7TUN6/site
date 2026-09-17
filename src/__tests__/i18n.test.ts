import { describe, it, expect } from 'bun:test'
import { isLocaleDictionary } from '@/lib/i18n'

describe('isLocaleDictionary', () => {
  const validDictionary = {
    site: { title: 'Test' },
      nav: {
        main: 'Main', bio: 'Bio', music: 'Music', news: 'News',
        blog: 'Blog', links: 'Links', donate: 'Donate', shop: 'Shop',
        projects: 'Projects', gallery: 'Gallery', video: 'Video', radio: 'Radio',
      },
    loader: {
      detecting: 'Detecting', fallback: 'Fallback', english: 'English', russian: 'Russian',
    },
  }

  it('returns true for valid dictionary', () => {
    expect(isLocaleDictionary(validDictionary)).toBe(true)
  })

  it('returns false for null', () => {
    expect(isLocaleDictionary(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isLocaleDictionary(undefined)).toBe(false)
  })

  it('returns false for non-object values', () => {
    expect(isLocaleDictionary('string')).toBe(false)
    expect(isLocaleDictionary(42)).toBe(false)
    expect(isLocaleDictionary(true)).toBe(false)
  })

  it('returns false when site.title is missing', () => {
    const invalid = { ...validDictionary, site: { title: '' } }
    expect(isLocaleDictionary(invalid)).toBe(false)
  })

  it('returns false when nav.main is missing', () => {
    const invalid = { ...validDictionary, nav: { ...validDictionary.nav, main: '' } }
    expect(isLocaleDictionary(invalid)).toBe(false)
  })

  it('returns false when loader is missing', () => {
    const invalid = { ...validDictionary, loader: undefined }
    expect(isLocaleDictionary(invalid)).toBe(false)
  })

  it('returns false for empty object', () => {
    expect(isLocaleDictionary({})).toBe(false)
  })
})
