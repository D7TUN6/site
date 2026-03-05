import type { ComponentType, ReactNode } from "react";
import {
  releaseContentModuleMap,
  releaseRoutes,
  type ReleaseRoute
} from "@/lib/generated-release-routes";
import MdxLink from "@/components/MdxLink";

export type Lang = "en" | "ru";

export type BaseRoute = "main" | "bio" | "git" | "music" | "news" | "blog" | "links";
export type RouteKey = BaseRoute | ReleaseRoute;

type MdxModule = {
  default: ComponentType;
};

const mdxComponents = {
  a: MdxLink
};

const baseRoutes = ["bio", "git", "music", "news", "blog", "links"] as const;

function isBaseRoute(value: string): value is (typeof baseRoutes)[number] {
  return baseRoutes.includes(value as (typeof baseRoutes)[number]);
}

function isReleaseRoute(value: string): value is ReleaseRoute {
  return releaseRoutes.includes(value as ReleaseRoute);
}

const baseContentModuleMap: Record<Lang, Record<BaseRoute, () => Promise<MdxModule>>> = {
  en: {
    main: () => import("../../content/mdx/en/base/main.mdx"),
    bio: () => import("../../content/mdx/en/base/bio.mdx"),
    git: () => import("../../content/mdx/en/base/git.mdx"),
    music: () => import("../../content/mdx/en/base/music.mdx"),
    news: () => import("../../content/mdx/en/base/news.mdx"),
    blog: () => import("../../content/mdx/en/base/blog.mdx"),
    links: () => import("../../content/mdx/en/base/links.mdx")
  },
  ru: {
    main: () => import("../../content/mdx/ru/base/main.mdx"),
    bio: () => import("../../content/mdx/ru/base/bio.mdx"),
    git: () => import("../../content/mdx/ru/base/git.mdx"),
    music: () => import("../../content/mdx/ru/base/music.mdx"),
    news: () => import("../../content/mdx/ru/base/news.mdx"),
    blog: () => import("../../content/mdx/ru/base/blog.mdx"),
    links: () => import("../../content/mdx/ru/base/links.mdx")
  }
};

const contentModuleMap: Record<Lang, Record<RouteKey, () => Promise<MdxModule>>> = {
  en: {
    ...baseContentModuleMap.en,
    ...releaseContentModuleMap.en
  },
  ru: {
    ...baseContentModuleMap.ru,
    ...releaseContentModuleMap.ru
  }
};

export function resolveRoute(slug?: string[]): RouteKey | null {
  if (!slug || slug.length === 0) {
    return "main";
  }

  const value = slug.join("/");
  if (isBaseRoute(value)) {
    return value;
  }
  if (isReleaseRoute(value)) {
    return value;
  }

  return null;
}

export async function getContent(lang: Lang, route: RouteKey): Promise<ReactNode> {
  const mod = await contentModuleMap[lang][route]();
  const Content = mod.default as ComponentType<{ components?: typeof mdxComponents }>;
  return <Content components={mdxComponents} />;
}
