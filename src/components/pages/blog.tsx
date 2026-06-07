import { For, Show, createMemo } from 'solid-js'
import { getAllBlogPosts, getBlogPostBySlug } from '@/lib/blog'
import { renderSimpleMarkdown } from '@/lib/simpleMarkdown'
import type { Lang } from '@/types/content'

export function BlogIndex(props: {
  lang: Lang
  navigate: (href: string, event?: MouseEvent) => void
  navBlog: string
}) {
  const blogPosts = createMemo(() => getAllBlogPosts(props.lang))
  const blogIntroText = props.lang === 'ru'
    ? 'заметки, процессы, релизы и все промежуточные штуки между музыкой и кодом.'
    : 'notes, process logs, releases, and everything between music and code.'

  return (
    <>
      <h1>{props.navBlog}</h1>
      <p class="blog-index-intro">{blogIntroText}</p>
      <div class="blog-grid">
        <For each={blogPosts()}>
          {(post) => (
            <a class="blog-card" href={`/${props.lang}/blog/${post.slug}`} onClick={(e) => props.navigate(`/${props.lang}/blog/${post.slug}`, e)}>
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

export function BlogPost(props: {
  lang: Lang
  slug: string
  navigate: (href: string, event?: MouseEvent) => void
  blogBack: string
}) {
  const blogPost = createMemo(() => getBlogPostBySlug(props.lang, props.slug))

  return (
    <Show when={blogPost()}>
      {(post) => (
        <article class="blog-post">
          <a class="content-link-plain" href={`/${props.lang}/blog`} onClick={(e) => props.navigate(`/${props.lang}/blog`, e)}>{props.blogBack}</a>
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
