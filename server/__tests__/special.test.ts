import { describe, it, expect } from 'bun:test'
import { DatabaseSync } from '../lib/sqlite.js'
import {
  DEFAULT_SPECIAL,
  getSpecialData,
  localizeSpecial,
  sanitizeSpecial,
  saveSpecialData,
} from '../lib/special-content.js'
import { broadcastSpecial, subscribeSpecialEvents } from '../lib/special-events.js'
import { createSpecialRouter } from '../routes/special.js'

function makeDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec('CREATE TABLE site_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
  return db
}

describe('special content sanitize', () => {
  it('falls back to defaults for garbage input', () => {
    const data = sanitizeSpecial(null)
    expect(data.bio.en).toBe(DEFAULT_SPECIAL.bio.en)
    expect(data.thanks.length).toBe(DEFAULT_SPECIAL.thanks.length)
    expect(data.webring).toEqual([])
    expect(data.bannerHtml).toBe(DEFAULT_SPECIAL.bannerHtml)
  })

  it('strips path traversal, unsafe urls and keeps relative badges', () => {
    const data = sanitizeSpecial({
      bio: { en: 'hi', ru: 'привет' },
      thanks: [{ id: 'x', name: 'x', role: { en: 'r', ru: 'р' }, text: { en: 't', ru: 'т' }, avatar: '../evil.png', url: 'javascript:alert(1)' }],
      webring: [
        { id: 'a', name: 'a', url: 'javascript:alert(1)', badge: 'https://x/b.gif', owner: 'o' },
        { id: 'b', name: 'b', url: 'https://b.example', badge: '/media/badge.gif', owner: '' },
      ],
      bannerHtml: '<b>x</b>',
    })
    expect(data.thanks[0].avatar).toBe('evil.png')
    expect(data.thanks[0].url).toBe('')
    expect(data.webring.length).toBe(1)
    expect(data.webring[0].url).toBe('https://b.example')
    expect(data.bannerHtml).toBe('<b>x</b>')
  })

  it('localizes text and resolves avatar paths', () => {
    const data = sanitizeSpecial({
      bio: { en: 'hello', ru: 'привет' },
      thanks: [{ id: 'a', name: 'a', role: { en: 'dev', ru: 'разраб' }, text: { en: 't', ru: 'т' }, avatar: 'a.webp', url: 'https://t.me/a' }],
      webring: [],
      bannerHtml: 'b',
    })
    expect(localizeSpecial(data, 'ru').bio).toBe('привет')
    const card = localizeSpecial(data, 'en').thanks[0]
    expect(card.text).toBe('t')
    expect(card.avatar).toBe('/media/image/people/a.webp?v=2')
    expect(card.url).toBe('https://t.me/a')
  })

  it('defaults include clickable links for the people modules', () => {
    const urls = new Map(DEFAULT_SPECIAL.thanks.map((card) => [card.id, card.url]))
    expect(urls.get('emily')).toBe('https://github.com/emilumiq')
    expect(urls.get('ilja')).toBe('https://t.me/sobiratelPeca')
    expect(urls.get('toffo')).toBe('https://cultoffoil.bandcamp.com/')
    expect(urls.get('okroshka7')).toBe('https://t.me/okroshka7p')
    expect(urls.get('matbeq')).toBe('https://t.me/matbeq332')
    expect(urls.get('therest')).toBe('')
  })
})

describe('special content storage', () => {
  it('persists and reads back through site_config', () => {
    const db = makeDb()
    expect(getSpecialData(db).bio.en).toBe(DEFAULT_SPECIAL.bio.en)

    const saved = saveSpecialData(db, { ...DEFAULT_SPECIAL, bio: { en: 'new', ru: 'новый' } })
    expect(saved.bio.en).toBe('new')
    expect(getSpecialData(db).bio.en).toBe('new')
  })
})

describe('special events', () => {
  it('broadcasts to subscribers and stops after unsubscribe', () => {
    const seen: string[] = []
    const unsubscribe = subscribeSpecialEvents((data) => seen.push(data.bio.en))
    broadcastSpecial(DEFAULT_SPECIAL)
    unsubscribe()
    broadcastSpecial({ ...DEFAULT_SPECIAL, bio: { en: 'second', ru: '' } })
    expect(seen).toEqual([DEFAULT_SPECIAL.bio.en])
  })
})

describe('special public route', () => {
  it('serves localized content and honours lang', async () => {
    const db = makeDb()
    saveSpecialData(db, { ...DEFAULT_SPECIAL, bio: { en: 'english', ru: 'русский' } })
    const app = createSpecialRouter({ db })

    const en = await app.handle(new Request('http://localhost/api/special?lang=en'))
    const enBody = (await en.json()) as { ok: boolean; lang: string; special: { bio: string } }
    expect(enBody.ok).toBe(true)
    expect(enBody.lang).toBe('en')
    expect(enBody.special.bio).toBe('english')

    const ru = await app.handle(new Request('http://localhost/api/special?lang=ru'))
    const ruBody = (await ru.json()) as { lang: string; special: { bio: string } }
    expect(ruBody.lang).toBe('ru')
    expect(ruBody.special.bio).toBe('русский')
  })
})
