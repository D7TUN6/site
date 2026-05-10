import type { BlogPostEntry, Lang } from "@/types/content";

type BlogSourceMap = Record<string, string>;

const blogSourcesByLang: Record<Lang, BlogSourceMap> = {
  en: import.meta.glob("../../content/mdx/en/blog/*.mdx", {
    eager: true,
    query: "?raw",
    import: "default"
  }) as BlogSourceMap,
  ru: import.meta.glob("../../content/mdx/ru/blog/*.mdx", {
    eager: true,
    query: "?raw",
    import: "default"
  }) as BlogSourceMap
};

const newsSourcesByLang: Record<Lang, BlogSourceMap> = {
  en: import.meta.glob("../../content/mdx/en/news/*.mdx", {
    eager: true,
    query: "?raw",
    import: "default"
  }) as BlogSourceMap,
  ru: import.meta.glob("../../content/mdx/ru/news/*.mdx", {
    eager: true,
    query: "?raw",
    import: "default"
  }) as BlogSourceMap
};

const blogCache = new Map<Lang, BlogPostEntry[]>();
const newsCache = new Map<Lang, BlogPostEntry[]>();

function parseFrontmatter(source: string): { data: Record<string, string>; content: string } {
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

function getSlugFromPath(filePath: string): string {
  return filePath.split("/").pop()?.replace(/\.mdx$/, "") ?? "";
}

function parseSourceMap(sourcesByPath: BlogSourceMap, lang: Lang): BlogPostEntry[] {
  return Object.entries(sourcesByPath)
    .map(([modulePath, source]) => {
      const { data, content } = parseFrontmatter(source);
      const slug = data.slug?.trim() || getSlugFromPath(modulePath);
      return {
        slug,
        title: data.title?.trim() || slug,
        excerpt: data.excerpt?.trim() || "",
        publishedAt: data.publishedAt?.trim() || "",
        content,
        lang
      };
    })
    .filter((p) => p.slug.length > 0)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export function getAllBlogPosts(lang: Lang): BlogPostEntry[] {
  const cached = blogCache.get(lang);
  if (cached) return cached;
  const posts = parseSourceMap(blogSourcesByLang[lang], lang);
  blogCache.set(lang, posts);
  return posts;
}

export function getBlogPostBySlug(lang: Lang, slug: string): BlogPostEntry | null {
  return getAllBlogPosts(lang).find((p) => p.slug === slug) ?? null;
}

export function getAllNewsPosts(lang: Lang): BlogPostEntry[] {
  const cached = newsCache.get(lang);
  if (cached) return cached;
  const posts = parseSourceMap(newsSourcesByLang[lang], lang);
  newsCache.set(lang, posts);
  return posts;
}

export function getNewsPostBySlug(lang: Lang, slug: string): BlogPostEntry | null {
  return getAllNewsPosts(lang).find((p) => p.slug === slug) ?? null;
}

// Live manifest fetch — used at runtime when posts are created/edited via admin
type LiveManifest = { blog: Record<Lang, BlogPostEntry[]>; news: Record<Lang, BlogPostEntry[]> } | null;
let liveManifestCache: LiveManifest = null;
let liveManifestFetching: Promise<LiveManifest> | null = null;

export async function fetchLiveContentManifest() {
  if (liveManifestCache) return liveManifestCache;
  if (liveManifestFetching) return liveManifestFetching;

  liveManifestFetching = (async () => {
    try {
      const resp = await fetch("/api/content/manifest", { cache: "no-store" });
      if (!resp.ok) return null;
      const data = await resp.json();
      liveManifestCache = data;
      return liveManifestCache;
    } catch {
      return null;
    }
  })();

  return liveManifestFetching;
}

export function invalidateLiveContentManifest() {
  liveManifestCache = null;
  liveManifestFetching = null;
}
