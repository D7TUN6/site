import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const ROOT = process.cwd()
const CONTENT_DIR = path.join(ROOT, 'content', 'mdx')
const OUT_PATH = path.join(ROOT, 'src', 'generated', 'news-manifest.json')

type ArticleMeta = { slug: string; title: string; excerpt: string; publishedAt: string }

function parseFrontmatter(source: string): Record<string, string> {
  const normalized = source.replace(/^\uFEFF/, '')
  if (!normalized.startsWith('---\n')) return {}
  const endIndex = normalized.indexOf('\n---\n', 4)
  if (endIndex === -1) return {}
  const raw = normalized.slice(4, endIndex)
  const data: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const i = line.indexOf(':')
    if (i === -1) continue
    const key = line.slice(0, i).trim()
    const value = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    if (key) data[key] = value
  }
  return data
}

async function scan(): Promise<Record<string, ArticleMeta[]>> {
  const result: Record<string, ArticleMeta[]> = { en: [], ru: [] }
  for (const lang of ['en', 'ru'] as const) {
    const dir = path.join(CONTENT_DIR, lang, 'news')
    const files = await readdir(dir).catch(() => [])
    for (const file of files) {
      if (!file.endsWith('.mdx')) continue
      const src = await readFile(path.join(dir, file), 'utf-8')
      const fm = parseFrontmatter(src)
      const slug = fm.slug?.trim() || file.replace(/\.mdx$/, '')
      if (!slug) continue
      result[lang].push({
        slug,
        title: fm.title?.trim() || slug,
        excerpt: fm.excerpt?.trim() || '',
        publishedAt: fm.publishedAt?.trim() || '',
      })
    }
    result[lang].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  }
  return result
}

async function main() {
  const news = await scan()
  await mkdir(path.dirname(OUT_PATH), { recursive: true })
  await writeFile(
    OUT_PATH,
    JSON.stringify({ generatedAt: new Date().toISOString(), news }, null, 2),
    'utf-8',
  )
  console.log(`Generated news-manifest.json (news ru=${news.ru.length} en=${news.en.length})`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})