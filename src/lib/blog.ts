import type { BlogPostEntry, Lang } from "@/types/content";

type RawBlogModule = string | { default: string };

const blogContexts: Record<Lang, __WebpackModuleApi.RequireContext> = {
  en: require.context("../../content/mdx/en/blog", false, /\.mdx$/),
  ru: require.context("../../content/mdx/ru/blog", false, /\.mdx$/)
};

const blogCache = new Map<Lang, BlogPostEntry[]>();

function unwrapRawModule(mod: RawBlogModule): string {
  return typeof mod === "string" ? mod : mod.default;
}

function parseFrontmatter(source: string): { data: Record<string, string>; content: string } {
  const normalized = source.replace(/^\uFEFF/, "");
  if (!normalized.startsWith("---\n")) {
    return { data: {}, content: normalized.trim() };
  }

  const endIndex = normalized.indexOf("\n---\n", 4);
  if (endIndex === -1) {
    return { data: {}, content: normalized.trim() };
  }

  const rawFrontmatter = normalized.slice(4, endIndex);
  const body = normalized.slice(endIndex + 5).trim();
  const data: Record<string, string> = {};

  for (const line of rawFrontmatter.split("\n")) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    const value = line
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");

    if (key) data[key] = value;
  }

  return { data, content: body };
}

function getBlogSlugFromPath(path: string): string {
  return path.split("/").pop()?.replace(/\.mdx$/, "") ?? "";
}

function sortByPublishedAtDesc(a: BlogPostEntry, b: BlogPostEntry): number {
  return b.publishedAt.localeCompare(a.publishedAt);
}

export function getAllBlogPosts(lang: Lang): BlogPostEntry[] {
  const cached = blogCache.get(lang);
  if (cached) return cached;

  const context = blogContexts[lang];
  const posts = context
    .keys()
    .map((modulePath) => {
      const source = unwrapRawModule(context(modulePath) as RawBlogModule);
      const { data, content } = parseFrontmatter(source);
      const slug = data.slug?.trim() || getBlogSlugFromPath(modulePath);
      const title = data.title?.trim() || slug;
      const excerpt = data.excerpt?.trim() || "";
      const publishedAt = data.publishedAt?.trim() || "";

      return {
        slug,
        title,
        excerpt,
        publishedAt,
        content,
        lang
      };
    })
    .filter((post) => post.slug.length > 0)
    .sort(sortByPublishedAtDesc);

  blogCache.set(lang, posts);
  return posts;
}

export function getBlogPostBySlug(lang: Lang, slug: string): BlogPostEntry | null {
  return getAllBlogPosts(lang).find((post) => post.slug === slug) ?? null;
}
