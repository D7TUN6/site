import type { DatabaseSync } from './sqlite.js'

export type Lang = 'en' | 'ru'
export type LocalizedText = { en: string; ru: string }

export type ThanksCard = {
  id: string
  name: string
  role: LocalizedText
  text: LocalizedText
  avatar: string
  url: string
}

export type WebringSite = {
  id: string
  name: string
  url: string
  badge: string
  owner: string
}

export type SpecialData = {
  bio: LocalizedText
  thanks: ThanksCard[]
  webring: WebringSite[]
  bannerHtml: string
}

export type LocalizedThanksCard = { id: string; name: string; role: string; text: string; avatar: string; url: string }
export type LocalizedSpecial = {
  bio: string
  thanks: LocalizedThanksCard[]
  webring: WebringSite[]
  bannerHtml: string
}

const CONFIG_KEY = 'special_content'

const DEFAULT_BANNER = `<a href="https://d7tun6.neome.uk" target="_blank" rel="noopener"><img src="https://d7tun6.neome.uk/media/image/badges/d7tun6-88x31.gif?v=2" alt="d7tun6" width="88" height="31" border="0"></a>`

function t(en: string, ru: string): LocalizedText {
  return { en, ru }
}

export const DEFAULT_SPECIAL: SpecialData = {
  bio: t(
    'fullstack programmer and underground musician. i write code, make noise and keep this archive online.',
    'fullstack-программист и андеграунд-музыкант. пишу код, делаю шум и держу этот архив онлайн.',
  ),
  thanks: [
    { id: 'emily', name: 'emily', role: t('developer', 'разработчица'), avatar: 'emily.webp', url: 'https://github.com/emilumiq', text: t('helped with bugs on the site, rewrote the frontend to solidjs', 'помогала с багами на сайте, переписала фронт на solidjs') },
    { id: 'ilja', name: 'ilja', role: t('anykey, gamer', 'эникей, геймер'), avatar: 'ilja.webp', url: 'https://t.me/sobiratelPeca', text: t('provided financial support for the whole infrastructure', 'помогал всей инфраструктуре финансово') },
    { id: 'toffo', name: 'toffo', role: t('musician, designer', 'музыкантша, дизайнер'), avatar: 'toffo.webp', url: 'https://cultoffoil.bandcamp.com/', text: t('helped fix english translation errors', 'помогала с ошибками перевода на английский') },
    { id: 'okroshka7', name: 'okroshka7', role: t('anykey, technologies enjoyer', 'эникей, любитель технологий'), avatar: 'okroshka7.webp', url: 'https://t.me/okroshka7p', text: t('helped fix english translation errors', 'помогал с ошибками перевода на английский') },
    { id: 'matbeq', name: 'matbeq', role: t('anykey, d7tun6 music enjoyer', 'эникей, любитель музыки d7tun6'), avatar: 'matbeq.webp', url: 'https://t.me/matbeq332', text: t('helped hunt bugs, provided analog release formats as extras for the site, supported the vpn infrastructure', 'помогал с поиском багов, поставлял аналоговые версии релизов как дополнение на сайт, поддерживал инфраструктуру (оплата vpn)') },
    { id: 'therest', name: 'the rest', role: t('everyone else', 'все остальные'), avatar: 'therest.webp', url: '', text: t('even if i forgot someone — you are all awesome, thanks for everything', 'даже если я кого-то забыл — все прекрасны и спасибо за всё') },
  ],
  webring: [
    {
      id: 'emilumiq',
      name: 'emilumiq',
      url: 'https://emilumiq.github.io',
      badge: '/media/image/badges/emilumiq-88x31.gif',
      owner: '',
    },
  ],
  bannerHtml: DEFAULT_BANNER,
}

function str(value: unknown, fallback = '', max = 4000): string {
  return typeof value === 'string' ? value.slice(0, max) : fallback
}

function loc(value: unknown, fallback: LocalizedText, max = 8000): LocalizedText {
  if (!value || typeof value !== 'object') return fallback
  const source = value as Record<string, unknown>
  return {
    en: str(source.en, fallback.en, max),
    ru: str(source.ru, fallback.ru, max),
  }
}

function safeId(value: unknown, fallback: string): string {
  const raw = typeof value === 'string' ? value.trim() : ''
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)
  return cleaned || fallback
}

function safeAvatar(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw) || raw.startsWith('/')) return raw.slice(0, 300)
  return raw.replace(/[^a-zA-Z0-9._-]/g, '').replace(/^\.+/, '').slice(0, 120)
}

function safeUrl(value: unknown, max = 500): string {
  const raw = str(value, '', max).trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw) || raw.startsWith('/')) return raw
  return ''
}

export function sanitizeSpecial(input: unknown): SpecialData {
  const source = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>

  const thanksInput = Array.isArray(source.thanks) ? source.thanks : DEFAULT_SPECIAL.thanks
  const thanks: ThanksCard[] = thanksInput.slice(0, 100).map((entry, index) => {
    const card = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>
    return {
      id: safeId(card.id, `thanks-${index}`),
      name: str(card.name, '', 120),
      role: loc(card.role, { en: '', ru: '' }, 200),
      text: loc(card.text, { en: '', ru: '' }, 4000),
      avatar: safeAvatar(card.avatar),
      url: safeUrl(card.url),
    }
  })

  const webringInput = Array.isArray(source.webring) ? source.webring : []
  const webring: WebringSite[] = webringInput.slice(0, 200).map((entry, index) => {
    const site = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>
    return {
      id: safeId(site.id, `ring-${index}`),
      name: str(site.name, '', 120),
      url: safeUrl(site.url),
      badge: safeUrl(site.badge),
      owner: str(site.owner, '', 120),
    }
  })

  return {
    bio: loc(source.bio, DEFAULT_SPECIAL.bio),
    thanks,
    webring: webring.filter((site) => site.url),
    bannerHtml: str(source.bannerHtml, DEFAULT_SPECIAL.bannerHtml, 4000),
  }
}

export function getSpecialData(db: DatabaseSync): SpecialData {
  try {
    const row = db.prepare('SELECT value FROM site_config WHERE key = ?').get(CONFIG_KEY) as { value?: string } | undefined
    if (!row?.value) return structuredClone(DEFAULT_SPECIAL)
    return sanitizeSpecial(JSON.parse(row.value))
  } catch {
    return structuredClone(DEFAULT_SPECIAL)
  }
}

export function saveSpecialData(db: DatabaseSync, data: SpecialData): SpecialData {
  const clean = sanitizeSpecial(data)
  db.prepare('INSERT INTO site_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(CONFIG_KEY, JSON.stringify(clean))
  return clean
}

function avatarUrl(file: string): string {
  if (!file) return ''
  if (file.startsWith('/') || /^https?:\/\//i.test(file)) return file
  return `/media/image/people/${file}?v=2`
}

export function localizeSpecial(data: SpecialData, lang: Lang): LocalizedSpecial {
  return {
    bio: data.bio[lang] || data.bio.en,
    thanks: data.thanks.map((card) => ({
      id: card.id,
      name: card.name,
      role: card.role[lang] || card.role.en,
      text: card.text[lang] || card.text.en,
      avatar: avatarUrl(card.avatar),
      url: card.url,
    })),
    webring: data.webring,
    bannerHtml: data.bannerHtml,
  }
}
