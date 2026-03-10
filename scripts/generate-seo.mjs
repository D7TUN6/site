import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, "public");
const CONTENT_ROOT = path.join(ROOT, "content", "mdx");
const RELEASE_MANIFEST_PATH = path.join(ROOT, "src", "generated", "release-manifest.json");

function normalizeOrigin(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/g, "");
}

const DEFAULT_ORIGIN = "https://d7tun6.site";
const SITE_ORIGIN = normalizeOrigin(process.env.SITE_ORIGIN) || DEFAULT_ORIGIN;

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toIsoDate(value) {
  if (!(value instanceof Date) || Number.isNaN(value.valueOf())) return null;
  return value.toISOString().slice(0, 10);
}

async function safeStat(filePath) {
  try {
    return await fs.stat(filePath);
  } catch {
    return null;
  }
}

async function readReleaseManifest() {
  try {
    const raw = await fs.readFile(RELEASE_MANIFEST_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (!Array.isArray(parsed.releases)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseDdMmYyyy(value) {
  const m = String(value || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
  if (day < 1 || day > 31) return null;
  if (month < 1 || month > 12) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.valueOf()) ? null : date;
}

function parseFrontmatter(source) {
  const normalized = String(source || "").replace(/^\uFEFF/, "");
  if (!normalized.startsWith("---\n")) {
    return { data: {}, content: normalized };
  }

  const endIndex = normalized.indexOf("\n---\n", 4);
  if (endIndex === -1) {
    return { data: {}, content: normalized };
  }

  const rawFrontmatter = normalized.slice(4, endIndex);
  const body = normalized.slice(endIndex + 5);
  const data = {};

  for (const line of rawFrontmatter.split("\n")) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    const value = line
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    if (!key) continue;
    data[key] = value;
  }

  return { data, content: body };
}

function urlFor(pathname) {
  if (!pathname.startsWith("/")) return `${SITE_ORIGIN}/${pathname}`;
  return `${SITE_ORIGIN}${pathname}`;
}

function uniqByLoc(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (!item?.loc) continue;
    if (seen.has(item.loc)) continue;
    seen.add(item.loc);
    out.push(item);
  }
  return out;
}

async function collectBlogPostUrls(lang) {
  const dir = path.join(CONTENT_ROOT, lang, "blog");
  const files = await fs.readdir(dir).catch(() => []);

  const items = [];
  for (const fileName of files) {
    if (!fileName.endsWith(".mdx")) continue;
    const filePath = path.join(dir, fileName);
    const stat = await safeStat(filePath);
    const lastmod = stat ? toIsoDate(stat.mtime) : null;
    const source = await fs.readFile(filePath, "utf8").catch(() => "");
    const { data } = parseFrontmatter(source);
    const slug =
      (typeof data.slug === "string" && data.slug.trim()) || fileName.replace(/\.mdx$/i, "");
    if (!slug) continue;

    items.push({
      loc: urlFor(`/${lang}/blog/${encodeURIComponent(slug)}`),
      lastmod
    });
  }

  return items;
}

async function collectBaseUrls(lang) {
  const routes = [
    { route: "main", pathname: `/${lang}`, fileName: "main.mdx" },
    { route: "bio", pathname: `/${lang}/bio`, fileName: "bio.mdx" },
    { route: "music", pathname: `/${lang}/music`, fileName: "music.mdx" },
    { route: "news", pathname: `/${lang}/news`, fileName: "news.mdx" },
    { route: "blog", pathname: `/${lang}/blog`, fileName: "blog.mdx" },
    { route: "links", pathname: `/${lang}/links`, fileName: "links.mdx" }
  ];

  const items = [];
  for (const entry of routes) {
    const filePath = path.join(CONTENT_ROOT, lang, "base", entry.fileName);
    const stat = await safeStat(filePath);
    items.push({
      loc: urlFor(entry.pathname),
      lastmod: stat ? toIsoDate(stat.mtime) : null
    });
  }
  return items;
}

async function collectReleaseUrls(langs) {
  const manifest = await readReleaseManifest();
  if (!manifest) return [];

  const items = [];
  for (const release of manifest.releases) {
    if (!release?.slug) continue;
    const releaseDate = parseDdMmYyyy(release.releaseDate);
    const lastmod = releaseDate ? toIsoDate(releaseDate) : null;
    for (const lang of langs) {
      items.push({
        loc: urlFor(`/${lang}/music/${encodeURIComponent(release.slug)}`),
        lastmod
      });
    }
  }
  return items;
}

function renderSitemap(urls) {
  const items = uniqByLoc(urls)
    .map((entry) => {
      const parts = [
        "  <url>",
        `    <loc>${xmlEscape(entry.loc)}</loc>`,
        entry.lastmod ? `    <lastmod>${xmlEscape(entry.lastmod)}</lastmod>` : null,
        "  </url>"
      ].filter(Boolean);
      return parts.join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    items,
    "</urlset>",
    ""
  ].join("\n");
}

function renderRobots() {
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    `Sitemap: ${urlFor("/sitemap.xml")}`,
    ""
  ].join("\n");
}

async function main() {
  const langs = ["en", "ru"];
  const urls = [];

  for (const lang of langs) {
    urls.push(...(await collectBaseUrls(lang)));
    urls.push(...(await collectBlogPostUrls(lang)));
  }

  urls.push(...(await collectReleaseUrls(langs)));

  await fs.mkdir(PUBLIC_DIR, { recursive: true });
  await fs.writeFile(path.join(PUBLIC_DIR, "robots.txt"), renderRobots(), "utf8");
  await fs.writeFile(path.join(PUBLIC_DIR, "sitemap.xml"), renderSitemap(urls), "utf8");

  console.log(`Generated robots.txt and sitemap.xml (${uniqByLoc(urls).length} urls)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
