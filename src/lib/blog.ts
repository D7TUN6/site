import { createSignal } from 'solid-js'
import newsManifest from '@/generated/news-manifest.json'
import type { BlogPostEntry, Lang } from "@/types/content";

type NewsMeta = { slug: string; title: string; excerpt: string; publishedAt: string };

const manifest = newsManifest as { generatedAt: string; news: Record<Lang, NewsMeta[]> };

// ── live blog feed (no rebuild) ─────────────────────────────────
// The blog index is served live from the server (`/api/content/blog`),
// so the client bundle never embeds post mdx — nothing to rebuild to
// publish, and no multi-megabyte of content in the initial JS.
const [liveBlog, setLiveBlog] = createSignal<Partial<Record<Lang, BlogPostEntry[]>>>({});

interface BlogListResponse {
  ok?: boolean;
  lang?: string;
  posts?: Array<{
    slug: string; title: string; excerpt: string; publishedAt: string;
    updatedAt?: string; tags?: string[]; wordCount?: number;
  }>;
}

interface BlogDetailResponse {
  ok?: boolean;
  lang?: string;
  post?: {
    slug: string; title: string; excerpt: string; publishedAt: string; content?: string;
    updatedAt?: string; tags?: string[]; wordCount?: number;
  };
}

interface ArticleDetailResponse {
  ok?: boolean;
  ru?: { slug: string; title: string; excerpt: string; publishedAt: string; content?: string } | null;
  en?: { slug: string; title: string; excerpt: string; publishedAt: string; content?: string } | null;
}

const LIVE_REFRESH_MS = 30_000;

let liveStarted = false;

function refreshLiveBlog(lang?: Lang): void {
  const langs: Lang[] = lang ? [lang] : ["ru", "en"];
  for (const l of langs) {
    fetch(`/api/content/blog?lang=${l}`, { headers: { accept: "application/json" } })
      .then((r) => (r.ok ? (r.json() as Promise<BlogListResponse>) : null))
      .then((data) => {
        if (!data?.ok || !Array.isArray(data.posts)) return;
        const posts = data.posts
          .filter((p) => p && typeof p.slug === "string" && p.slug.length > 0)
          .map<BlogPostEntry>((p) => ({
            slug: p.slug,
            title: p.title || p.slug,
            excerpt: p.excerpt || "",
            publishedAt: p.publishedAt || "",
            content: "",
            lang: l,
            updatedAt: p.updatedAt || "",
            tags: Array.isArray(p.tags) ? p.tags : [],
            wordCount: typeof p.wordCount === "number" ? p.wordCount : undefined,
          }))
          .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
        setLiveBlog((prev) => ({ ...prev, [l]: posts }));
      })
      .catch(() => { /* keep last good snapshot */ });
  }
}

function startLiveBlog(): void {
  if (liveStarted) return;
  liveStarted = true;
  refreshLiveBlog();
  window.setInterval(() => {
    if (document.visibilityState !== "visible") return;
    refreshLiveBlog();
  }, LIVE_REFRESH_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshLiveBlog();
  });
}

export function parseFrontmatter(source: string): { data: Record<string, string>; content: string } {
  const normalized = source.replace(/^\uFEFF/, "");
  if (!normalized.startsWith("---\n")) return { data: {}, content: normalized.trim() };
  const endIndex = normalized.indexOf("\n---\n", 4);
  if (endIndex === -1) return { data: {}, content: normalized.trim() };
  const rawFrontmatter = normalized.slice(4, endIndex);
  const body = normalized.slice(endIndex + 5).trim();
  const data: Record<string, string> = {};
  for (const line of rawFrontmatter.split("\n")) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key) data[key] = value;
  }
  return { data, content: body };
}

export function getAllBlogPosts(lang: Lang): BlogPostEntry[] {
  const live = liveBlog()[lang];
  if (live) return live;
  startLiveBlog();
  return [];
}

export function getBlogPostBySlug(lang: Lang, slug: string): BlogPostEntry | null {
  const live = liveBlog()[lang];
  if (live) return live.find((p) => p.slug === slug) ?? null;
  startLiveBlog();
  return null;
}

export async function fetchBlogPostContent(lang: Lang, slug: string): Promise<BlogPostEntry | null> {
  try {
    const res = await fetch(`/api/content/blog/${encodeURIComponent(slug)}?lang=${lang}`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as BlogDetailResponse;
    if (!data?.ok || !data.post) return null;
    return {
      slug,
      title: data.post.title || slug,
      excerpt: data.post.excerpt || "",
      publishedAt: data.post.publishedAt || "",
      content: data.post.content || "",
      lang,
      updatedAt: data.post.updatedAt || "",
      tags: Array.isArray(data.post.tags) ? data.post.tags : [],
      wordCount: typeof data.post.wordCount === "number" ? data.post.wordCount : undefined,
    };
  } catch {
    return null;
  }
}

function getNewsManifest(lang: Lang): BlogPostEntry[] {
  return (manifest.news[lang] ?? []).map((meta) => ({
    slug: meta.slug,
    title: meta.title,
    excerpt: meta.excerpt,
    publishedAt: meta.publishedAt,
    content: "",
    lang,
  }));
}

export function getAllNewsPosts(lang: Lang): BlogPostEntry[] {
  return getNewsManifest(lang);
}

export function getNewsPostBySlug(lang: Lang, slug: string): BlogPostEntry | null {
  return getNewsManifest(lang).find((p) => p.slug === slug) ?? null;
}

export async function fetchNewsPostContent(lang: Lang, slug: string): Promise<BlogPostEntry | null> {
  try {
    const res = await fetch(`/api/content/news/${encodeURIComponent(slug)}`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as ArticleDetailResponse;
    const post = data?.[lang] ?? null;
    if (!data?.ok || !post) return null;
    return {
      slug,
      title: post.title || slug,
      excerpt: post.excerpt || "",
      publishedAt: post.publishedAt || "",
      content: post.content || "",
      lang,
    };
  } catch {
    return null;
  }
}