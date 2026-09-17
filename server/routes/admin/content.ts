import { Elysia } from 'elysia'
import path from 'node:path'
import fs from 'node:fs/promises'
import { requireAdmin } from '../../middleware/require-auth.js'
import { parseMdx, serializeMdx } from '../../lib/frontmatter.js'

type ArticleData = { title?: string; slug?: string; excerpt?: string; publishedAt?: string; content?: string }

function createArticleRouter(contentRoot: string, type: 'news' | 'blog') {
  return new Elysia({ prefix: `/${type}` })
    .get('/', async ({ set }) => {
      try {
        const result: Record<string, Array<{ slug: string; title: string; excerpt: string; publishedAt: string }>> = { en: [], ru: [] }
        for (const lang of ['en', 'ru'] as const) {
          const dir = path.join(contentRoot, lang, type)
          try {
            const files = await fs.readdir(dir)
            for (const file of files) {
              if (!file.endsWith('.mdx')) continue
              const source = await fs.readFile(path.join(dir, file), 'utf-8')
              const { frontmatter } = parseMdx(source)
              const slug = frontmatter.slug?.trim() || file.replace(/\.mdx$/, '')
              result[lang].push({
                slug,
                title: frontmatter.title?.trim() || slug,
                excerpt: frontmatter.excerpt?.trim() || '',
                publishedAt: frontmatter.publishedAt?.trim() || '',
              })
            }
          } catch { /* directory may not exist */ }
        }
        return { ok: true, ...result }
      } catch {
        set.status = 500
        return { ok: false, error: 'Failed to list articles' }
      }
    }, { beforeHandle: requireAdmin })
    .get('/:slug', async ({ params, set }) => {
      try {
        const { slug } = params
        if (slug.includes('..') || slug.includes('/') || slug.includes('\\')) {
          set.status = 400
          return { ok: false, error: 'Invalid slug' }
        }
        const result: Record<string, { slug: string; title: string; excerpt: string; publishedAt: string; content: string } | null> = { en: null, ru: null }
        for (const lang of ['en', 'ru'] as const) {
          const filePath = path.join(contentRoot, lang, type, `${slug}.mdx`)
          try {
            const source = await fs.readFile(filePath, 'utf-8')
            const { frontmatter, body } = parseMdx(source)
            result[lang] = {
              slug: frontmatter.slug?.trim() || slug,
              title: frontmatter.title?.trim() || slug,
              excerpt: frontmatter.excerpt?.trim() || '',
              publishedAt: frontmatter.publishedAt?.trim() || '',
              content: body,
            }
          } catch { /* file may not exist */ }
        }
        return { ok: true, ...result }
      } catch {
        set.status = 500
        return { ok: false, error: 'Failed to get article' }
      }
    }, { beforeHandle: requireAdmin })
    .post('/', async ({ body, set }) => {
      try {
        const { en, ru } = (body || {}) as {
          en?: ArticleData
          ru?: ArticleData
        }
        const slug = en?.slug || ru?.slug
        if (!slug) {
          set.status = 400
          return { ok: false, error: 'Slug is required' }
        }
        if (slug.includes('..') || slug.includes('/') || slug.includes('\\')) {
          set.status = 400
          return { ok: false, error: 'Invalid slug' }
        }
        for (const [lang, data] of Object.entries({ en, ru }) as Array<[string, ArticleData | undefined]>) {
          if (!data) continue
          const dir = path.join(contentRoot, lang, type)
          await fs.mkdir(dir, { recursive: true })
          const fm: Record<string, string> = { title: data.title || slug, slug: data.slug || slug }
          if (data.excerpt) fm.excerpt = data.excerpt
          if (data.publishedAt) fm.publishedAt = data.publishedAt
          await fs.writeFile(path.join(dir, `${slug}.mdx`), serializeMdx(fm, data.content || ''), 'utf-8')
        }
        set.status = 201
        return { ok: true, slug }
      } catch {
        set.status = 500
        return { ok: false, error: 'Failed to create article' }
      }
    }, { beforeHandle: requireAdmin })
    .put('/:slug', async ({ params, body, set }) => {
      try {
        const { slug } = params
        if (slug.includes('..') || slug.includes('/') || slug.includes('\\')) {
          set.status = 400
          return { ok: false, error: 'Invalid slug' }
        }
        const { en, ru } = (body || {}) as {
          en?: ArticleData
          ru?: ArticleData
        }
        for (const [lang, data] of Object.entries({ en, ru }) as Array<[string, ArticleData | undefined]>) {
          if (!data) continue
          const filePath = path.join(contentRoot, lang, type, `${slug}.mdx`)
          let existing: { frontmatter: Record<string, string>; body: string } = { frontmatter: {}, body: '' }
          try {
            const source = await fs.readFile(filePath, 'utf-8')
            existing = parseMdx(source)
          } catch { /* file may not exist — start fresh */ }
          const fm: Record<string, string> = {
            ...existing.frontmatter,
            slug,
            ...(data.title ? { title: data.title } : {}),
            ...(data.excerpt ? { excerpt: data.excerpt } : {}),
            ...(data.publishedAt ? { publishedAt: data.publishedAt } : {}),
          }
          const articleBody = data.content !== undefined ? data.content : existing.body
          await fs.mkdir(path.dirname(filePath), { recursive: true })
          await fs.writeFile(filePath, serializeMdx(fm, articleBody), 'utf-8')
        }
        return { ok: true }
      } catch {
        set.status = 500
        return { ok: false, error: 'Failed to update article' }
      }
    }, { beforeHandle: requireAdmin })
    .delete('/:slug', async ({ params, set }) => {
      try {
        const { slug } = params
        if (slug.includes('..') || slug.includes('/') || slug.includes('\\')) {
          set.status = 400
          return { ok: false, error: 'Invalid slug' }
        }
        for (const lang of ['en', 'ru']) {
          try { await fs.unlink(path.join(contentRoot, lang, type, `${slug}.mdx`)) } catch { /* file may not exist */ }
        }
        return { ok: true }
      } catch {
        set.status = 500
        return { ok: false, error: 'Failed to delete article' }
      }
    }, { beforeHandle: requireAdmin })
}

export function createAdminContentRouter({ contentRoot }: { contentRoot: string }) {
  return new Elysia({ prefix: '/api/admin/content' })
    .use(createArticleRouter(contentRoot, 'news'))
    .use(createArticleRouter(contentRoot, 'blog'))
    .guard({ beforeHandle: [requireAdmin] }, (app) => app
      .get('/pages', async ({ set }) => {
        try {
          const result: Record<string, string[]> = { en: [], ru: [] }
          for (const lang of ['en', 'ru'] as const) {
            const dir = path.join(contentRoot, lang, 'base')
            try {
              const files = await fs.readdir(dir)
              result[lang] = files.filter((f) => f.endsWith('.mdx')).map((f) => f.replace(/\.mdx$/, ''))
            } catch { /* directory may not exist */ }
          }
          return { ok: true, ...result }
        } catch {
          set.status = 500
          return { ok: false, error: 'Failed to list pages' }
        }
      })
      .get('/pages/:pageKey', async ({ params, set }) => {
        try {
          const { pageKey } = params
          if (pageKey.includes('..') || pageKey.includes('/') || pageKey.includes('\\')) {
            set.status = 400
            return { ok: false, error: 'Invalid page key' }
          }
          const result: Record<string, { content: string } | null> = { en: null, ru: null }
          for (const lang of ['en', 'ru'] as const) {
            const filePath = path.join(contentRoot, lang, 'base', `${pageKey}.mdx`)
            try {
              const source = await fs.readFile(filePath, 'utf-8')
              const { body } = parseMdx(source)
              result[lang] = { content: body }
            } catch { /* file may not exist */ }
          }
          return { ok: true, ...result }
        } catch {
          set.status = 500
          return { ok: false, error: 'Failed to get page' }
        }
      })
      .put('/pages/:pageKey', async ({ params, body, set }) => {
        try {
          const { pageKey } = params
          if (pageKey.includes('..') || pageKey.includes('/') || pageKey.includes('\\')) {
            set.status = 400
            return { ok: false, error: 'Invalid page key' }
          }
          const { en, ru } = (body || {}) as {
            en?: { content: string }
            ru?: { content: string }
          }
          for (const [lang, data] of Object.entries({ en, ru }) as Array<[string, { content: string } | undefined]>) {
            if (!data) continue
            const filePath = path.join(contentRoot, lang, 'base', `${pageKey}.mdx`)
            await fs.mkdir(path.dirname(filePath), { recursive: true })
            await fs.writeFile(filePath, data.content + '\n', 'utf-8')
          }
          return { ok: true }
        } catch {
          set.status = 500
          return { ok: false, error: 'Failed to update page' }
        }
      }))
}
