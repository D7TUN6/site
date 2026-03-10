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

type ReleaseManifestModule = typeof import("@/lib/releaseManifest");
let releaseManifestModulePromise: Promise<ReleaseManifestModule> | null = null;

function loadReleaseManifestModule(): Promise<ReleaseManifestModule> {
  if (!releaseManifestModulePromise) {
    releaseManifestModulePromise = import("@/lib/releaseManifest");
  }
  return releaseManifestModulePromise;
}

type BlogModule = typeof import("@/lib/blog");
let blogModulePromise: Promise<BlogModule> | null = null;

function loadBlogModule(): Promise<BlogModule> {
  if (!blogModulePromise) {
    blogModulePromise = import("@/lib/blog");
  }
  return blogModulePromise;
}

const baseContentModuleMap: Record<Lang, Record<BaseRoute, () => Promise<RawContentModule>>> = {
  en: {
    main: () => import("../../content/mdx/en/base/main.mdx"),
    bio: () => import("../../content/mdx/en/base/bio.mdx"),
    music: () => import("../../content/mdx/en/base/music.mdx"),
    news: () => import("../../content/mdx/en/base/news.mdx"),
    blog: () => import("../../content/mdx/en/base/blog.mdx"),
    links: () => import("../../content/mdx/en/base/links.mdx")
  },
  ru: {
    main: () => import("../../content/mdx/ru/base/main.mdx"),
    bio: () => import("../../content/mdx/ru/base/bio.mdx"),
    music: () => import("../../content/mdx/ru/base/music.mdx"),
    news: () => import("../../content/mdx/ru/base/news.mdx"),
    blog: () => import("../../content/mdx/ru/base/blog.mdx"),
    links: () => import("../../content/mdx/ru/base/links.mdx")
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

  if (value.startsWith("music/")) {
    const slug = value.replace("music/", "").trim();
    if (!slug) return null;
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
    const { getAllReleases } = await loadReleaseManifestModule();
    return {
      kind: "music-index",
      releases: getAllReleases()
    };
  }

  if (route.startsWith("music/")) {
    const { getReleaseBySlug } = await loadReleaseManifestModule();
    const release = getReleaseBySlug(route.replace("music/", ""));
    if (!release) return null;

    return {
      kind: "release",
      release
    };
  }

  if (route === "blog") {
    const { getAllBlogPosts } = await loadBlogModule();
    return {
      kind: "blog-index",
      posts: getAllBlogPosts(lang)
    };
  }

  if (route.startsWith("blog/")) {
    const { getBlogPostBySlug } = await loadBlogModule();
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
