import { getAllReleases, getReleaseBySlug, getReleaseRoutes } from "@/lib/releaseManifest";
import type { BaseRoute, BlogPostEntry, Lang, ReleaseEntry, RouteKey } from "@/types/content";

export type RoutePayload =
  | {
      kind: "markdown";
      source: string;
    }
  | {
      kind: "music-index";
      releases: ReleaseEntry[];
    }
  | {
      kind: "release";
      release: ReleaseEntry;
    }
  | {
      kind: "blog-index";
      posts: BlogPostEntry[];
    }
  | {
      kind: "blog-post";
      post: BlogPostEntry;
    };

type RawContentModule = {
  default: string;
};

const baseRoutes = ["bio", "music", "news", "blog", "links"] as const;

function isBaseRoute(value: string): value is (typeof baseRoutes)[number] {
  return baseRoutes.includes(value as (typeof baseRoutes)[number]);
}

function isReleaseRoute(value: string): boolean {
  return getReleaseRoutes().includes(value);
}

type BlogModuleMap = Record<string, string>;

const blogModules = {
  en: import.meta.glob("../../content/mdx/en/blog/*.mdx", { query: "?raw", import: "default", eager: true }),
  ru: import.meta.glob("../../content/mdx/ru/blog/*.mdx", { query: "?raw", import: "default", eager: true })
} satisfies Record<Lang, BlogModuleMap>;

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

function getAllBlogPosts(lang: Lang): BlogPostEntry[] {
  const modules = blogModules[lang];

  return Object.entries(modules)
    .map(([path, source]) => {
      const { data, content } = parseFrontmatter(source);
      const slug = data.slug?.trim() || getBlogSlugFromPath(path);
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
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function getBlogPostBySlug(lang: Lang, slug: string): BlogPostEntry | null {
  return getAllBlogPosts(lang).find((post) => post.slug === slug) ?? null;
}

const baseContentModuleMap: Record<Lang, Record<BaseRoute, () => Promise<RawContentModule>>> = {
  en: {
    main: () => import("../../content/mdx/en/base/main.mdx?raw"),
    bio: () => import("../../content/mdx/en/base/bio.mdx?raw"),
    music: () => import("../../content/mdx/en/base/music.mdx?raw"),
    news: () => import("../../content/mdx/en/base/news.mdx?raw"),
    blog: () => import("../../content/mdx/en/base/blog.mdx?raw"),
    links: () => import("../../content/mdx/en/base/links.mdx?raw")
  },
  ru: {
    main: () => import("../../content/mdx/ru/base/main.mdx?raw"),
    bio: () => import("../../content/mdx/ru/base/bio.mdx?raw"),
    music: () => import("../../content/mdx/ru/base/music.mdx?raw"),
    news: () => import("../../content/mdx/ru/base/news.mdx?raw"),
    blog: () => import("../../content/mdx/ru/base/blog.mdx?raw"),
    links: () => import("../../content/mdx/ru/base/links.mdx?raw")
  }
};

export function splitSplat(splat: string): string[] {
  if (!splat) return [];
  return splat
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function resolveRoute(slugParts: string[]): RouteKey | null {
  if (slugParts.length === 0) {
    return "main";
  }

  const value = slugParts.join("/");
  if (isBaseRoute(value)) {
    return value;
  }

  if (isReleaseRoute(value)) {
    return value as RouteKey;
  }

  if (value.startsWith("blog/")) {
    const slug = value.replace("blog/", "").trim();
    if (!slug) return null;
    return value as RouteKey;
  }

  return null;
}

function cleanupBaseMarkdown(source: string): string {
  return source
    .replace(/^import\s+.+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function getRoutePayload(lang: Lang, route: RouteKey): Promise<RoutePayload | null> {
  if (route === "music") {
    return {
      kind: "music-index",
      releases: getAllReleases()
    };
  }

  if (route.startsWith("music/")) {
    const release = getReleaseBySlug(route.replace("music/", ""));
    if (!release) return null;

    return {
      kind: "release",
      release
    };
  }

  if (route === "blog") {
    return {
      kind: "blog-index",
      posts: getAllBlogPosts(lang)
    };
  }

  if (route.startsWith("blog/")) {
    const post = getBlogPostBySlug(lang, route.replace("blog/", ""));
    if (!post) return null;

    return {
      kind: "blog-post",
      post
    };
  }

  const moduleLoader = baseContentModuleMap[lang][route as BaseRoute];
  if (!moduleLoader) return null;

  const mod = await moduleLoader();
  return {
    kind: "markdown",
    source: cleanupBaseMarkdown(mod.default)
  };
}
