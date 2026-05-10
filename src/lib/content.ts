import type { BaseRoute, BlogPostEntry, Lang, ProjectEntry, ReleaseEntry, RouteKey } from "@/types/content";
import type { ShopProduct, ShopProductDetails } from "@/types/shop";
import { getAllBlogPosts, getBlogPostBySlug, getAllNewsPosts, getNewsPostBySlug, fetchLiveContentManifest } from "@/lib/blog";
import { compareReleasesByDateDesc } from "@/lib/music";
import { fetchLiveManifest, getAllReleases, getReleaseBySlug } from "@/lib/releaseManifest";
import { getAllShopProducts, getShopProductDetails, fetchLiveShopManifest } from "@/lib/shop";
import { getAllProjects } from "@/lib/projects";

import enMainSource from "../../content/mdx/en/base/main.mdx?raw";
import enBioSource from "../../content/mdx/en/base/bio.mdx?raw";
import enBlogSource from "../../content/mdx/en/base/blog.mdx?raw";
import enShopSource from "../../content/mdx/en/base/shop.mdx?raw";
import enLegalSource from "../../content/mdx/en/base/legal.mdx?raw";
import enContactSource from "../../content/mdx/en/base/contact.mdx?raw";
import enLinksSource from "../../content/mdx/en/base/links.mdx?raw";
import ruMainSource from "../../content/mdx/ru/base/main.mdx?raw";
import ruBioSource from "../../content/mdx/ru/base/bio.mdx?raw";
import ruBlogSource from "../../content/mdx/ru/base/blog.mdx?raw";
import ruShopSource from "../../content/mdx/ru/base/shop.mdx?raw";
import ruLegalSource from "../../content/mdx/ru/base/legal.mdx?raw";
import ruContactSource from "../../content/mdx/ru/base/contact.mdx?raw";
import ruLinksSource from "../../content/mdx/ru/base/links.mdx?raw";

export type RoutePayload =
  | { kind: "markdown"; source: string }
  | { kind: "music-index"; releases: ReleaseEntry[] }
  | { kind: "release"; release: ReleaseEntry }
  | { kind: "blog-index"; posts: BlogPostEntry[] }
  | { kind: "blog-post"; post: BlogPostEntry }
  | { kind: "news-index"; posts: BlogPostEntry[] }
  | { kind: "news-post"; post: BlogPostEntry }
  | { kind: "projects-index"; projects: ProjectEntry[] }
  | { kind: "oss-migrator" }
  | { kind: "shop-index"; products: ShopProduct[] }
  | { kind: "shop-product"; product: ShopProductDetails }
  | { kind: "cart" }
  | { kind: "account" }
  | { kind: "admin" };

const baseRoutes = ["bio", "music", "news", "blog", "projects", "shop", "links", "legal", "contact"] as const;

function isBaseRoute(value: string): value is (typeof baseRoutes)[number] {
  return baseRoutes.includes(value as (typeof baseRoutes)[number]);
}

const baseMarkdownByLang: Record<Lang, Record<BaseRoute, string>> = {
  en: {
    main: enMainSource,
    bio: enBioSource,
    music: "",
    news: "",
    blog: enBlogSource,
    projects: "",
    shop: enShopSource,
    legal: enLegalSource,
    contact: enContactSource,
    links: enLinksSource
  },
  ru: {
    main: ruMainSource,
    bio: ruBioSource,
    music: "",
    news: "",
    blog: ruBlogSource,
    projects: "",
    shop: ruShopSource,
    legal: ruLegalSource,
    contact: ruContactSource,
    links: ruLinksSource
  }
};

export function splitSplat(splat: string): string[] {
  if (!splat) return [];
  return splat.split("/").map((p) => p.trim()).filter(Boolean);
}

export function resolveRoute(slugParts: string[]): RouteKey | null {
  if (slugParts.length === 0) return "main";
  const value = slugParts.join("/");
  if (value === "cart" || value === "account" || value === "admin") return value as RouteKey;
  if (isBaseRoute(value)) return value;
  if (value.startsWith("music/") && value.replace("music/", "").trim()) return value as RouteKey;
  if (value.startsWith("blog/") && value.replace("blog/", "").trim()) return value as RouteKey;
  if (value.startsWith("news/") && value.replace("news/", "").trim()) return value as RouteKey;
  if (value.startsWith("projects/") && value.replace("projects/", "").trim()) return value as RouteKey;
  if (value.startsWith("shop/") && value.replace("shop/", "").trim()) return value as RouteKey;
  return null;
}

function cleanupBaseMarkdown(source: string): string {
  return source.replace(/^import\s+.+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
}

const mainMarkdownByLang: Record<Lang, string> = {
  en: cleanupBaseMarkdown(enMainSource),
  ru: cleanupBaseMarkdown(ruMainSource)
};

export async function getRoutePayload(lang: Lang, route: RouteKey): Promise<RoutePayload | null> {
  if (route === "cart") return { kind: "cart" };
  if (route === "account") return { kind: "account" };
  if (route === "admin") return { kind: "admin" };
  if (route === "main") return { kind: "markdown", source: mainMarkdownByLang[lang] };

  if (route === "music") {
    const manifest = await fetchLiveManifest().catch(() => null);
    const releases = manifest ? manifest.releases.slice().sort(compareReleasesByDateDesc) : getAllReleases();
    return { kind: "music-index", releases };
  }

  if (route.startsWith("music/")) {
    const slug = route.replace("music/", "");
    const manifest = await fetchLiveManifest().catch(() => null);
    const release = manifest ? (manifest.releases.find((r) => r.slug === slug) ?? null) : getReleaseBySlug(slug);
    if (!release) return null;
    return { kind: "release", release };
  }

  if (route === "blog") {
    const live = await fetchLiveContentManifest().catch(() => null);
    const posts = (live?.blog[lang] ?? getAllBlogPosts(lang)) as BlogPostEntry[];
    return { kind: "blog-index", posts };
  }

  if (route.startsWith("blog/")) {
    const slug = route.replace("blog/", "");
    const live = await fetchLiveContentManifest().catch(() => null);
    const post = live?.blog[lang]?.find((p: BlogPostEntry) => p.slug === slug) ?? getBlogPostBySlug(lang, slug);
    if (!post) return null;
    return { kind: "blog-post", post };
  }

  if (route === "news") {
    const live = await fetchLiveContentManifest().catch(() => null);
    const posts = (live?.news[lang] ?? getAllNewsPosts(lang)) as BlogPostEntry[];
    return { kind: "news-index", posts };
  }

  if (route.startsWith("news/")) {
    const slug = route.replace("news/", "");
    const live = await fetchLiveContentManifest().catch(() => null);
    const post = live?.news[lang]?.find((p: BlogPostEntry) => p.slug === slug) ?? getNewsPostBySlug(lang, slug);
    if (!post) return null;
    return { kind: "news-post", post };
  }

  if (route === "projects") {
    const projects = getAllProjects();
    return { kind: "projects-index", projects };
  }

  if (route === "projects/oss-migrator") {
    return { kind: "oss-migrator" };
  }

  if (route === "shop") {
    const live = await fetchLiveShopManifest().catch(() => null);
    const products = live ? live.products : getAllShopProducts();
    return { kind: "shop-index", products };
  }

  if (route.startsWith("shop/")) {
    const slug = route.replace("shop/", "").trim();
    if (!slug) return null;
    const live = await fetchLiveShopManifest().catch(() => null);
    const liveProduct = live?.products.find((p) => p.slug === slug) ?? null;
    if (liveProduct) {
      const descriptionMarkdown = (liveProduct as { description?: { en?: string; ru?: string }; descriptionMarkdown?: string }).description?.[lang]
        ?? (liveProduct as { descriptionMarkdown?: string }).descriptionMarkdown ?? "";
      return { kind: "shop-product", product: { ...liveProduct, lang, descriptionMarkdown } };
    }
    const product = getShopProductDetails(lang, slug);
    if (!product) return null;
    return { kind: "shop-product", product };
  }

  const source = baseMarkdownByLang[lang][route as BaseRoute];
  if (!source) return null;
  return { kind: "markdown", source: cleanupBaseMarkdown(source) };
}
