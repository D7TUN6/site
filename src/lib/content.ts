import type { BaseRoute, BlogPostEntry, Lang, ReleaseEntry, RouteKey } from "@/types/content";
import type { ShopProduct, ShopProductDetails } from "@/types/shop";
import { getAllBlogPosts, getBlogPostBySlug } from "@/lib/blog";
import { compareReleasesByDateDesc } from "@/lib/music";
import { fetchLiveManifest, getAllReleases, getReleaseBySlug } from "@/lib/releaseManifest";
import { getAllShopProducts, getShopProductDetails } from "@/lib/shop";

import enMainSource from "../../content/mdx/en/base/main.mdx?raw";
import enBioSource from "../../content/mdx/en/base/bio.mdx?raw";
import enNewsSource from "../../content/mdx/en/base/news.mdx?raw";
import enBlogSource from "../../content/mdx/en/base/blog.mdx?raw";
import enShopSource from "../../content/mdx/en/base/shop.mdx?raw";
import enLegalSource from "../../content/mdx/en/base/legal.mdx?raw";
import enContactSource from "../../content/mdx/en/base/contact.mdx?raw";
import enLinksSource from "../../content/mdx/en/base/links.mdx?raw";
import ruMainSource from "../../content/mdx/ru/base/main.mdx?raw";
import ruBioSource from "../../content/mdx/ru/base/bio.mdx?raw";
import ruNewsSource from "../../content/mdx/ru/base/news.mdx?raw";
import ruBlogSource from "../../content/mdx/ru/base/blog.mdx?raw";
import ruShopSource from "../../content/mdx/ru/base/shop.mdx?raw";
import ruLegalSource from "../../content/mdx/ru/base/legal.mdx?raw";
import ruContactSource from "../../content/mdx/ru/base/contact.mdx?raw";
import ruLinksSource from "../../content/mdx/ru/base/links.mdx?raw";

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
    }
  | {
      kind: "shop-index";
      products: ShopProduct[];
    }
  | {
      kind: "shop-product";
      product: ShopProductDetails;
    }
  | {
      kind: "cart";
    }
  | {
      kind: "account";
    }
  | {
      kind: "admin";
    };

const baseRoutes = ["bio", "music", "news", "blog", "shop", "links", "legal", "contact"] as const;

function isBaseRoute(value: string): value is (typeof baseRoutes)[number] {
  return baseRoutes.includes(value as (typeof baseRoutes)[number]);
}

const baseMarkdownByLang: Record<Lang, Record<BaseRoute, string>> = {
  en: {
    main: enMainSource,
    bio: enBioSource,
    music: "",
    news: enNewsSource,
    blog: enBlogSource,
    shop: enShopSource,
    legal: enLegalSource,
    contact: enContactSource,
    links: enLinksSource
  },
  ru: {
    main: ruMainSource,
    bio: ruBioSource,
    music: "",
    news: ruNewsSource,
    blog: ruBlogSource,
    shop: ruShopSource,
    legal: ruLegalSource,
    contact: ruContactSource,
    links: ruLinksSource
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
  if (value === "cart" || value === "account" || value === "admin") {
    return value as RouteKey;
  }

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

  if (value.startsWith("shop/")) {
    const slug = value.replace("shop/", "").trim();
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

const mainMarkdownByLang: Record<Lang, string> = {
  en: cleanupBaseMarkdown(enMainSource),
  ru: cleanupBaseMarkdown(ruMainSource)
};

export async function getRoutePayload(lang: Lang, route: RouteKey): Promise<RoutePayload | null> {
  if (route === "cart") {
    return {
      kind: "cart"
    };
  }

  if (route === "account") {
    return {
      kind: "account"
    };
  }

  if (route === "admin") {
    return {
      kind: "admin"
    };
  }

  if (route === "main") {
    return {
      kind: "markdown",
      source: mainMarkdownByLang[lang]
    };
  }

  if (route === "music") {
    const manifest = await fetchLiveManifest().catch(() => null);
    const releases = manifest
      ? manifest.releases.slice().sort(compareReleasesByDateDesc)
      : getAllReleases();
    return {
      kind: "music-index",
      releases
    };
  }

  if (route.startsWith("music/")) {
    const slug = route.replace("music/", "");
    const manifest = await fetchLiveManifest().catch(() => null);
    const release = manifest
      ? (manifest.releases.find((r) => r.slug === slug) ?? null)
      : getReleaseBySlug(slug);
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

  if (route === "shop") {
    return {
      kind: "shop-index",
      products: getAllShopProducts()
    };
  }

  if (route.startsWith("shop/")) {
    const slug = route.replace("shop/", "").trim();
    if (!slug) return null;
    const product = getShopProductDetails(lang, slug);
    if (!product) return null;

    return {
      kind: "shop-product",
      product
    };
  }

  const source = baseMarkdownByLang[lang][route as BaseRoute];
  if (!source) return null;

  return {
    kind: "markdown",
    source: cleanupBaseMarkdown(source)
  };
}
