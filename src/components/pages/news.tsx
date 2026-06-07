import { For, Show, createMemo } from 'solid-js'
import { getAllNewsPosts, getNewsPostBySlug } from '@/lib/blog'
import { renderSimpleMarkdown } from '@/lib/simpleMarkdown'
import type { Lang } from '@/types/content'

export function NewsIndex(props: {
  lang: Lang
  navigate: (href: string, event?: MouseEvent) => void
  navNews: string
}) {
  const newsPosts = createMemo(() => getAllNewsPosts(props.lang))
  const newsIntroText = props.lang === 'ru'
    ? 'обновления, анонсы и всё что происходит.'
    : "updates, announcements, and what's happening."

  return (
    <>
      <h1>{props.navNews}</h1>
      <p class="blog-index-intro">{newsIntroText}</p>
      <div class="blog-grid">
        <For each={newsPosts()}>
          {(post) => (
            <a class="blog-card" href={`/${props.lang}/news/${post.slug}`} onClick={(e) => props.navigate(`/${props.lang}/news/${post.slug}`, e)}>
              <div class="blog-card-date">{post.publishedAt}</div>
              <h2>{post.title}</h2>
              <p>{post.excerpt}</p>
            </a>
          )}
        </For>
      </div>
    </>
  )
}

export function NewsPost(props: {
  lang: Lang
  slug: string
  navigate: (href: string, event?: MouseEvent) => void
  newsBack: string
}) {
  const newsPost = createMemo(() => getNewsPostBySlug(props.lang, props.slug))

  return (
    <Show when={newsPost()}>
      {(post) => (
        <article class="blog-post">
          <a class="content-link-plain" href={`/${props.lang}/news`} onClick={(e) => props.navigate(`/${props.lang}/news`, e)}>{props.newsBack}</a>
          <div class="blog-post-head">
            <h1>{post().title}</h1>
            <div class="blog-post-date">{post().publishedAt}</div>
          </div>
          <article class="markdown-content" innerHTML={renderSimpleMarkdown(post().content)} />
        </article>
      )}
    </Show>
  )
}
