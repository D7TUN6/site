import { getAllReleases, getReleaseBySlug, getReleaseRoutes } from "@/lib/releaseManifest";
import type { BaseRoute, Lang, ReleaseEntry, RouteKey } from "@/types/content";

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
    };

type RawContentModule = {
  default: string;
};

const baseRoutes = ["bio", "git", "music", "news", "blog", "links"] as const;

function isBaseRoute(value: string): value is (typeof baseRoutes)[number] {
  return baseRoutes.includes(value as (typeof baseRoutes)[number]);
}

function isReleaseRoute(value: string): boolean {
  return getReleaseRoutes().includes(value);
}

const baseContentModuleMap: Record<Lang, Record<BaseRoute, () => Promise<RawContentModule>>> = {
  en: {
    main: () => import("../../content/mdx/en/base/main.mdx?raw"),
    bio: () => import("../../content/mdx/en/base/bio.mdx?raw"),
    git: () => import("../../content/mdx/en/base/git.mdx?raw"),
    music: () => import("../../content/mdx/en/base/music.mdx?raw"),
    news: () => import("../../content/mdx/en/base/news.mdx?raw"),
    blog: () => import("../../content/mdx/en/base/blog.mdx?raw"),
    links: () => import("../../content/mdx/en/base/links.mdx?raw")
  },
  ru: {
    main: () => import("../../content/mdx/ru/base/main.mdx?raw"),
    bio: () => import("../../content/mdx/ru/base/bio.mdx?raw"),
    git: () => import("../../content/mdx/ru/base/git.mdx?raw"),
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

  const moduleLoader = baseContentModuleMap[lang][route as BaseRoute];
  if (!moduleLoader) return null;

  const mod = await moduleLoader();
  return {
    kind: "markdown",
    source: cleanupBaseMarkdown(mod.default)
  };
}
