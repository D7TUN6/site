import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js'
import { getAllBlogPosts, getBlogPostBySlug, fetchBlogPostContent } from '@/lib/blog'
import { renderSimpleMarkdown } from '@/lib/simpleMarkdown'
import { enhanceBlogMedia } from '@/lib/blogMedia'
import { fetchComments, countComments } from '@/lib/api/comments'
import { CommentsSection } from '@/components/blog-comments'
import { HeapCard, HeapControl } from '@/components/heap-card'
import { HEAP_BLOCKS } from '@/lib/heap'
import type { BlogPostEntry, Lang } from '@/types/content'

function __l(lang: string, en: string, ru: string): string { return lang === 'ru' ? ru : en }

function postEntryId(slug: string): string {
  let hash = 5381
  for (let i = 0; i < slug.length; i++) hash = ((hash << 5) + hash + slug.charCodeAt(i)) >>> 0
  return hash.toString(16).toUpperCase().padStart(8, '0')
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 10)
}

function estimateReadTime(words: number): number {
  return Math.max(1, Math.round(words / 200))
}

const BLOGROLL = [
  { label: 'exethyl', url: 'https://exethyl.bandcamp.com' },
  { label: 'Daniel Myslivets', url: 'https://myslivets.com' },
  { label: 'LunaStore', url: 'https://lunastore.app' },
  { label: 'Keygen FM', url: 'https://keygen.fm' },
  { label: 'Newgrounds', url: 'https://www.newgrounds.com' },
  { label: 'Neocities', url: 'https://neocities.org' },
]

export function BlogIndex(props: {
  lang: Lang
  navigate: (href: string, event?: MouseEvent) => void
  navBlog: string
}) {
  const blogPosts = createMemo(() => getAllBlogPosts(props.lang))
  const [loadedSectors, setLoadedSectors] = createSignal(1)
  const visiblePosts = createMemo(() => blogPosts().slice(0, loadedSectors() * HEAP_BLOCKS))
  const animatedSlugs = new Set<string>()
  const hasMore = createMemo(() => visiblePosts().length < blogPosts().length)
  const latestBlocks = createMemo(() =>
    Math.min(HEAP_BLOCKS, blogPosts().length - (loadedSectors() - 1) * HEAP_BLOCKS),
  )

  createEffect(() => {
    void props.lang
    setLoadedSectors(1)
  })

  return (
    <>
      <h1>{props.navBlog}</h1>
      <p class="blog-index-intro">{props.lang === 'ru' ? 'заметки, процессы, релизы и все промежуточные штуки между музыкой и кодом.' : 'notes, process logs, releases, and everything between music and code.'}</p>
      <Show when={blogPosts().length > 0} fallback={<p class="blog-empty">…</p>}>
        <div class="blog-grid heap-grid">
          <For each={visiblePosts()}>
            {(post, i) => {
              const firstSeen = !animatedSlugs.has(post.slug)
              animatedSlugs.add(post.slug)
              return (
                <HeapCard
                  post={post}
                  index={i()}
                  animate={firstSeen}
                  href={`/${props.lang}/blog/${post.slug}`}
                  onClick={(e) => props.navigate(`/${props.lang}/blog/${post.slug}`, e)}
                />
              )
            }}
          </For>
        </div>
        <HeapControl
          filledBlocks={latestBlocks()}
          sector={loadedSectors()}
          hasMore={hasMore()}
          onAllocate={() => setLoadedSectors((s) => s + 1)}
        />
      </Show>
    </>
  )
}

export function BlogPost(props: {
  lang: Lang
  slug: string
  navigate: (href: string, event?: MouseEvent) => void
  blogBack: string
  artistName: string
}) {
  const [post, setPost] = createSignal<BlogPostEntry | null>(null)
  const [lightboxSrc, setLightboxSrc] = createSignal('')
  const [coverLoaded, setCoverLoaded] = createSignal(false)
  const [toc, setToc] = createSignal<Array<{ level: number; text: string }>>([])
  const [commentsCount, setCommentsCount] = createSignal<number | null>(null)
  const [showTop, setShowTop] = createSignal(false)
  let contentEl: HTMLDivElement | undefined

  const posts = createMemo(() => getAllBlogPosts(props.lang))
  const postIndex = createMemo(() => posts().findIndex((p) => p.slug === props.slug))
  const prevPost = createMemo(() => (postIndex() >= 0 && postIndex() < posts().length - 1 ? posts()[postIndex() + 1] : null))
  const nextPost = createMemo(() => (postIndex() > 0 ? posts()[postIndex() - 1] : null))
  const randomPost = () => {
    const list = posts()
    return list.length > 0 ? list[Math.floor(Math.random() * list.length)] : null
  }

  const words = createMemo(() => {
    const p = post()
    if (!p) return 0
    if (typeof p.wordCount === 'number' && p.wordCount > 0) return p.wordCount
    return (p.content.match(/\S+/g) ?? []).length
  })

  createEffect((prevKey) => {
    const key = `${props.lang}:${props.slug}`
    if (prevKey === key) return key
    const cached = getBlogPostBySlug(props.lang, props.slug)
    if (cached?.content) {
      setPost(cached)
      return key
    }
    setPost(cached ? { ...cached, content: '' } : null)
    let cancelled = false
    onCleanup(() => { cancelled = true })
    void fetchBlogPostContent(props.lang, props.slug).then((p) => {
      if (!cancelled && p) setPost(p)
    })
    return key
  })

  createEffect(() => {
    const current = post()
    if (!current || !contentEl) return
    const dispose = enhanceBlogMedia(contentEl)
    const headings = contentEl.querySelectorAll('h2, h3, h4')
    setToc([...headings].map((el) => ({ level: parseInt(el.tagName.slice(1), 10), text: (el.textContent || '').slice(0, 80) })))
    onCleanup(dispose)
  })

  createEffect(() => {
    const p = post()
    if (!p) return
    let cancelled = false
    void fetchComments(`${props.lang}:${props.slug}`)
      .then((res) => { if (!cancelled) setCommentsCount(countComments(res.comments ?? [])) })
      .catch(() => { if (!cancelled) setCommentsCount(0) })
    onCleanup(() => { cancelled = true })
  })

  onMount(() => {
    const onScroll = () => setShowTop(window.scrollY > 400)
    window.addEventListener('scroll', onScroll, { passive: true })
    onCleanup(() => window.removeEventListener('scroll', onScroll))
  })

  const scrollToToc = (index: number) => {
    const el = contentEl?.querySelectorAll('h2, h3, h4')[index] as HTMLElement | undefined
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      window.history.replaceState(null, '', `#${el.id}`)
    }
  }

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' })

  const handleContentClick = (e: MouseEvent) => {
    const t = e.target as HTMLElement
    if (t?.tagName === 'IMG' && t.classList.contains('blog-media')) {
      e.preventDefault()
      setLightboxSrc((t as HTMLImageElement).currentSrc || (t as HTMLImageElement).src)
    }
  }

  const statsPosts = createMemo(() => posts().length)
  const statsWords = createMemo(() => posts().reduce((n, p) => n + (typeof p.wordCount === 'number' ? p.wordCount : 0), 0))
  const statsTags = createMemo(() => new Set(posts().flatMap((p) => p.tags ?? [])).size)

  return (
    <Show when={post()}>
      {(p) => (
        <>
          <div class="blog-layout">
            <div class="blog-main">
              <div class="blog-module">
                <article class="blog-post">
                  <a class="content-link-plain" href={`/${props.lang}/blog`} onClick={(e) => props.navigate(`/${props.lang}/blog`, e)}>{props.blogBack}</a>

                  <div class="blog-post-index">POST // 0x{postEntryId(p().slug)} — LOG ENTRY #{postEntryId(p().slug)}</div>

                  <div class="blog-post-head">
                    <h1>{p().title}</h1>
                  </div>

                  <div class="blog-meta-bar">
                    <span class="blog-meta-item"><span class="blog-meta-key">{__l(props.lang, 'by', 'автор')}</span> <strong>{props.artistName}</strong></span>
                    <span class="blog-meta-item"><span class="blog-meta-key">{__l(props.lang, 'published', 'опубл.')}</span> {formatDate(p().publishedAt)}</span>
                    <Show when={p().updatedAt && p().updatedAt !== p().publishedAt}>
                      <span class="blog-meta-item"><span class="blog-meta-key">{__l(props.lang, 'last modified', 'изменено')}</span> {formatDate(p().updatedAt!)}</span>
                    </Show>
                    <span class="blog-meta-item"><span class="blog-meta-key">{__l(props.lang, 'reading', 'чтение')}</span> {estimateReadTime(words())} {__l(props.lang, 'min', 'мин')}</span>
                    <span class="blog-meta-item">
                      <a class="content-link-plain" href="#comments" onClick={(e) => { e.preventDefault(); document.getElementById('comments')?.scrollIntoView({ behavior: 'smooth' }) }}>
                        {commentsCount() === null ? '…' : commentsCount()} {commentsCount() === 1 ? __l(props.lang, 'comment', 'комментарий') : __l(props.lang, 'comments', 'комментариев')}
                      </a>
                    </span>
                  </div>

                  <div class="blog-divider" aria-hidden="true"><span>· · ·</span></div>

                  <article ref={contentEl} class="markdown-content" onClick={handleContentClick} innerHTML={renderSimpleMarkdown(p().content, { openLinksInNewTab: true })} />
                </article>

                <CommentsSection lang={props.lang} slug={props.slug} />
              </div>
            </div>

            <aside class="blog-side">
              <div class="blog-widget">
                <div class="blog-widget-title">[ {__l(props.lang, 'BLOG STATS', 'СТАТИСТИКА БЛОГА')} ]</div>
                <div class="blog-widget-body">
                  <div class="blog-stat-row"><span>{__l(props.lang, 'posts', 'записей')}</span><b>{statsPosts()}</b></div>
                  <div class="blog-stat-row"><span>{__l(props.lang, 'words written', 'слов написано')}</span><b>{statsWords().toLocaleString()}</b></div>
                  <div class="blog-stat-row"><span>{__l(props.lang, 'tags', 'тегов')}</span><b>{statsTags()}</b></div>
                  <div class="blog-stat-row"><span>{__l(props.lang, 'built with', 'движок')}</span><b>solidjs / nixos</b></div>
                </div>
              </div>

              <Show when={toc().length > 0}>
                <div class="blog-widget">
                  <div class="blog-widget-title">[ {__l(props.lang, 'TABLE OF CONTENTS', 'СОДЕРЖАНИЕ')} ]</div>
                  <nav class="blog-widget-body blog-toc">
                    <For each={toc()}>{({ level, text }, i) => (
                      <button
                        type="button"
                        class={`blog-toc-item blog-toc-l${level}`}
                        onClick={() => scrollToToc(i())}
                      >
                        {level === 3 ? '└─ ' : '├ '}{text}
                      </button>
                    )}</For>
                  </nav>
                </div>
              </Show>

              <div class="blog-widget">
                <div class="blog-widget-title">[ {__l(props.lang, 'BLOGROLL / LINKS', 'БЛОГРОЛЛ')} ]</div>
                <div class="blog-widget-body blog-blogroll">
                  <For each={BLOGROLL}>{(link) => (
                    <a href={link.url} target="_blank" rel="noopener noreferrer"><span class="blog-blogroll-bullet">»</span> {link.label} ↗</a>
                  )}</For>
                </div>
              </div>

              <div class="blog-widget">
                <div class="blog-widget-title">[ {__l(props.lang, 'WEBRING', 'ВЕБРИНГ')} ]</div>
                <div class="blog-widget-body">
                  <div class="blog-webring">
                    <button
                      type="button"
                      class="shop-btn shop-btn-secondary"
                      disabled={!prevPost()}
                      onClick={(e) => prevPost() && props.navigate(`/${props.lang}/blog/${prevPost()!.slug}`, e)}
                    >
                      ← {__l(props.lang, 'prev', 'пред')}
                    </button>
                    <button type="button" class="shop-btn" onClick={(e) => { const r = randomPost(); if (r) props.navigate(`/${props.lang}/blog/${r.slug}`, e) }}>
                      {__l(props.lang, 'random', 'случайно')}
                    </button>
                    <button
                      type="button"
                      class="shop-btn shop-btn-secondary"
                      disabled={!nextPost()}
                      onClick={(e) => nextPost() && props.navigate(`/${props.lang}/blog/${nextPost()!.slug}`, e)}
                    >
                      {__l(props.lang, 'next', 'след')} →
                    </button>
                  </div>
                  <div class="comment-hint">{__l(props.lang, 'a blog is a webring again', 'блог — снова вебринг')}</div>
                </div>
              </div>

              <div class="blog-widget">
                <div class="blog-widget-title">[ RSS &amp; FEED ]</div>
                <div class="blog-widget-body">
                  <a class="shop-btn" href="/rss.xml" target="_blank" rel="noopener noreferrer">/rss.xml ↗</a>
                  <div class="comment-hint">{__l(props.lang, 'subscribe to the feed', 'подписка на ленту блога')}</div>
                </div>
              </div>
            </aside>
          </div>

          <Show when={lightboxSrc()}>
            <div class="shop-lightbox" onClick={() => setLightboxSrc('')}>
              <button type="button" class="overlay-close" aria-label="close" onClick={() => setLightboxSrc('')}>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
              <Show when={!coverLoaded()}>
                <div class="overlay-loading" />
              </Show>
              <img class="shop-lightbox-img" src={lightboxSrc()} alt="" onClick={(e) => e.stopPropagation()} onLoad={() => setCoverLoaded(true)} />
            </div>
          </Show>

          <button class="blog-top-btn" class:is-visible={showTop()} type="button" aria-label="top" onClick={scrollToTop}>[ ↑ {__l(props.lang, 'TOP', 'НАВЕРХ')} ]</button>
        </>
      )}
    </Show>
  )
}