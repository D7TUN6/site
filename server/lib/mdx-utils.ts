import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { parseMdx } from './frontmatter.js'

export interface MdxArticle {
  slug: string
  title: string
  excerpt: string
  publishedAt: string
  content?: string
  updatedAt?: string
  tags?: string[]
  wordCount?: number
}

function parseTags(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw.trim()) return []
  const cleaned = raw.trim().replace(/^\[/, '').replace(/\]$/, '')
  if (!cleaned) return []
  return cleaned.split(',').map((t) => t.trim().replace(/^['"]|['"]$/g, '').replace(/\s+/g, ' ')).filter(Boolean)
}

function stripHtml(source: string): string {
  return source.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function countWords(source: string): number {
  const text = stripHtml(source)
  return text ? text.split(' ').length : 0
}

async function toUpdatedAt(filePath: string): Promise<string> {
  const fileStat = await stat(filePath).catch(() => null)
  const mtime = fileStat?.mtimeMs ?? Date.now()
  return new Date(mtime).toISOString().slice(0, 10)
}

async function readArticleMeta(filePath: string, entry: MdxArticle): Promise<MdxArticle> {
  const { frontmatter, body } = parseMdx(await readFile(filePath, 'utf-8').catch(() => ''))
  if (!frontmatter.slug && !frontmatter.title) return entry
  return {
    ...entry,
    updatedAt: await toUpdatedAt(filePath),
    tags: parseTags(frontmatter.tags),
    wordCount: countWords(body),
  }
}

export async function readArticles(contentRoot: string, type: 'news' | 'blog') {
  const result: Record<string, MdxArticle[]> = { en: [], ru: [] }
  const langs = ['en', 'ru'] as const

  await Promise.all(langs.map(async (lang) => {
    const dir = path.join(contentRoot, lang, type)
    const files = await readdir(dir).catch(() => [] as string[])
    for (const file of files) {
      if (!file.endsWith('.mdx')) continue
      const filePath = path.join(dir, file)
      const source = await readFile(filePath, 'utf-8')
      const { frontmatter, body } = parseMdx(source)
      const slug = frontmatter.slug?.trim() || file.replace(/\.mdx$/, '')
      result[lang].push(await readArticleMeta(filePath, {
        slug,
        title: frontmatter.title?.trim() || slug,
        excerpt: frontmatter.excerpt?.trim() || '',
        publishedAt: frontmatter.publishedAt?.trim() || '',
        content: body,
      }))
    }
  }))

  return result
}

export async function readArticlesLang(contentRoot: string, lang: string, type: 'news' | 'blog', withContent = true): Promise<MdxArticle[]> {
  const dir = path.join(contentRoot, lang, type)
  const files = await readdir(dir).catch(() => [] as string[])
  const list: MdxArticle[] = []
  for (const file of files) {
    if (!file.endsWith('.mdx')) continue
    const filePath = path.join(dir, file)
    const source = await readFile(filePath, 'utf-8')
    const { frontmatter, body } = parseMdx(source)
    const slug = frontmatter.slug?.trim() || file.replace(/\.mdx$/, '')
    const entry: MdxArticle = {
      slug,
      title: frontmatter.title?.trim() || slug,
      excerpt: frontmatter.excerpt?.trim() || '',
      publishedAt: frontmatter.publishedAt?.trim() || '',
    }
    if (withContent) entry.content = body
    list.push(await readArticleMeta(filePath, entry))
  }
  return list
}

export async function readArticle(contentRoot: string, lang: string, type: 'news' | 'blog' | 'base', slug: string): Promise<MdxArticle | null> {
  const filePath = path.join(contentRoot, lang, type, `${slug}.mdx`)
  try {
    const source = await readFile(filePath, 'utf-8')
    const { frontmatter, body } = parseMdx(source)
    return await readArticleMeta(filePath, {
      slug: frontmatter.slug?.trim() || slug,
      title: frontmatter.title?.trim() || slug,
      excerpt: frontmatter.excerpt?.trim() || '',
      publishedAt: frontmatter.publishedAt?.trim() || '',
      content: body,
    })
  } catch {
    return null
  }
}

export async function readPages(contentRoot: string): Promise<Record<string, Record<string, string>>> {
  const result: Record<string, Record<string, string>> = { en: {}, ru: {} }
  const langs = ['en', 'ru'] as const

  await Promise.all(langs.map(async (lang) => {
    const dir = path.join(contentRoot, lang, 'base')
    const files = await readdir(dir).catch(() => [] as string[])
    for (const file of files) {
      if (!file.endsWith('.mdx')) continue
      const source = await readFile(path.join(dir, file), 'utf-8')
      const { body } = parseMdx(source)
      result[lang][file.replace(/\.mdx$/, '')] = body
    }
  }))

  return result
}
