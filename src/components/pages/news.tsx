import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js'
import { getAllNewsPosts, fetchNewsPostContent } from '@/lib/blog'
import { renderSimpleMarkdown } from '@/lib/simpleMarkdown'
import { HeapCard, HeapControl } from '@/components/heap-card'
import { HEAP_BLOCKS } from '@/lib/heap'
import type { BlogPostEntry, Lang } from '@/types/content'

export function NewsIndex(props: {
  lang: Lang
  navigate: (href: string, event?: MouseEvent) => void
  navNews: string
}) {
  const newsPosts = createMemo(() => getAllNewsPosts(props.lang))
  const [loadedSectors, setLoadedSectors] = createSignal(1)
  const visiblePosts = createMemo(() => newsPosts().slice(0, loadedSectors() * HEAP_BLOCKS))
  const animatedSlugs = new Set<string>()
  const hasMore = createMemo(() => visiblePosts().length < newsPosts().length)
  const latestBlocks = createMemo(() =>
    Math.min(HEAP_BLOCKS, newsPosts().length - (loadedSectors() - 1) * HEAP_BLOCKS),
  )

  createEffect(() => {
    void props.lang
    setLoadedSectors(1)
  })

  return (
    <>
      <h1>{props.navNews}</h1>
      <p class="blog-index-intro">{props.lang === 'ru' ? 'обновления, анонсы и всё что происходит.' : "updates, announcements, and what's happening."}</p>
      <Show when={newsPosts().length > 0} fallback={<p class="blog-empty">…</p>}>
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
                  href={`/${props.lang}/news/${post.slug}`}
                  onClick={(e) => props.navigate(`/${props.lang}/news/${post.slug}`, e)}
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

export function NewsPost(props: {
  lang: Lang
  slug: string
  navigate: (href: string, event?: MouseEvent) => void
  newsBack: string
}) {
  const [post, setPost] = createSignal<BlogPostEntry | null>(null)

  createEffect((prevKey) => {
    const key = `${props.lang}:${props.slug}`
    if (prevKey === key) return key
    setPost(null)
    let cancelled = false
    onCleanup(() => { cancelled = true })
    void fetchNewsPostContent(props.lang, props.slug).then((p) => {
      if (!cancelled && p) setPost(p)
    })
    return key
  })

  return (
    <Show when={post()}>
      {(p) => (
        <article class="blog-post">
          <a class="content-link-plain" href={`/${props.lang}/news`} onClick={(e) => props.navigate(`/${props.lang}/news`, e)}>{props.newsBack}</a>
          <div class="blog-post-head">
            <h1>{p().title}</h1>
            <div class="blog-post-date">{p().publishedAt}</div>
          </div>
          <article class="markdown-content" innerHTML={renderSimpleMarkdown(p().content)} />
        </article>
      )}
    </Show>
  )
}