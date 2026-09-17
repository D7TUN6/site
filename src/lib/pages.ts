import type { Lang } from '@/types/content'

import enMain from '../../content/mdx/en/base/main.mdx?raw'
import enBio from '../../content/mdx/en/base/bio.mdx?raw'
import enLinks from '../../content/mdx/en/base/links.mdx?raw'
import enDonate from '../../content/mdx/en/base/donate.mdx?raw'
import enNews from '../../content/mdx/en/base/news.mdx?raw'
import enBlog from '../../content/mdx/en/base/blog.mdx?raw'
import enShop from '../../content/mdx/en/base/shop.mdx?raw'
import enLegal from '../../content/mdx/en/base/legal.mdx?raw'
import enContact from '../../content/mdx/en/base/contact.mdx?raw'
import enGit from '../../content/mdx/en/base/git.mdx?raw'
import ruMain from '../../content/mdx/ru/base/main.mdx?raw'
import ruBio from '../../content/mdx/ru/base/bio.mdx?raw'
import ruLinks from '../../content/mdx/ru/base/links.mdx?raw'
import ruDonate from '../../content/mdx/ru/base/donate.mdx?raw'
import ruNews from '../../content/mdx/ru/base/news.mdx?raw'
import ruBlog from '../../content/mdx/ru/base/blog.mdx?raw'
import ruShop from '../../content/mdx/ru/base/shop.mdx?raw'
import ruLegal from '../../content/mdx/ru/base/legal.mdx?raw'
import ruContact from '../../content/mdx/ru/base/contact.mdx?raw'
import ruGit from '../../content/mdx/ru/base/git.mdx?raw'

function cleanup(source: string): string {
  return source.replace(/^---[\s\S]*?---\n?/m, '').replace(/^import\s+.+$/gm, '').trim()
}

const pages: Record<Lang, Record<string, string>> = {
  en: { main: cleanup(enMain), bio: cleanup(enBio), links: cleanup(enLinks), donate: cleanup(enDonate), news: cleanup(enNews), blog: cleanup(enBlog), shop: cleanup(enShop), legal: cleanup(enLegal), contact: cleanup(enContact), git: cleanup(enGit) },
  ru: { main: cleanup(ruMain), bio: cleanup(ruBio), links: cleanup(ruLinks), donate: cleanup(ruDonate), news: cleanup(ruNews), blog: cleanup(ruBlog), shop: cleanup(ruShop), legal: cleanup(ruLegal), contact: cleanup(ruContact), git: cleanup(ruGit) },
}

export function getPageMarkdown(lang: Lang, route: string): string {
  return pages[lang]?.[route] || ''
}
