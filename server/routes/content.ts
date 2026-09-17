import { Elysia } from 'elysia'
import { readArticles, readArticlesLang, readArticle, readPages, type MdxArticle } from '../lib/mdx-utils.js'
import { MemoryCache } from '../lib/in-memory-cache.js'

const manifestCache = new MemoryCache<{ news: Record<string, MdxArticle[]>; blog: Record<string, MdxArticle[]>; pages: Record<string, Record<string, string>> }>(5000)

export function createContentRouter({ contentRoot }: { contentRoot: string }) {
  return new Elysia({ prefix: '/api/content' })
    .get('/blog', async ({ query, set }) => {
      try {
        const lang = query['lang'] === 'en' ? 'en' : 'ru'
        const posts = await readArticlesLang(contentRoot, lang, 'blog', false)
        posts.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
        set.status = 200
        return { ok: true, lang, posts }
      } catch {
        set.status = 500
        return { ok: false, error: 'Failed to read blog' }
      }
    })
    .get('/blog/:slug', async ({ params, query, set }) => {
      try {
        const { slug } = params
        if (!slug || slug.includes('..') || slug.includes('/') || slug.includes('\\')) {
          set.status = 400
          return { error: 'Invalid slug' }
        }
        const lang = query['lang'] === 'en' ? 'en' : 'ru'
        const post = await readArticle(contentRoot, lang, 'blog', slug)
        if (!post) {
          set.status = 404
          return { ok: false, error: 'Not found' }
        }
        set.status = 200
        return { ok: true, lang, post }
      } catch {
        set.status = 500
        return { ok: false, error: 'Failed to get post' }
      }
    })
    .get('/manifest', async ({ set }) => {
      try {
        const cached = manifestCache.get()
        if (cached) {
          set.status = 200
          return { ok: true, ...cached }
        }
        const [news, blog, pages] = await Promise.all([
          readArticles(contentRoot, 'news'),
          readArticles(contentRoot, 'blog'),
          readPages(contentRoot),
        ])
        const result = { news, blog, pages }
        manifestCache.set(result)
        set.status = 200
        return { ok: true, ...result }
      } catch {
        set.status = 500
        return { ok: false, error: 'Failed to build manifest' }
      }
    })
    .get('/:type/:slug', async ({ params, set }) => {
      try {
        const { type, slug } = params
        if (type !== 'news' && type !== 'blog') {
          set.status = 404
          return { error: 'Not found' }
        }
        if (slug.includes('..') || slug.includes('/') || slug.includes('\\')) {
          set.status = 400
          return { error: 'Invalid slug' }
        }
        const result: Record<string, MdxArticle | null> = { en: null, ru: null }
        const [enResult, ruResult] = await Promise.all([
          readArticle(contentRoot, 'en', type, slug),
          readArticle(contentRoot, 'ru', type, slug),
        ])
        result.en = enResult
        result.ru = ruResult
        set.status = 200
        return { ok: true, ...result }
      } catch {
        set.status = 500
        return { ok: false, error: 'Failed to get article' }
      }
    })
}
