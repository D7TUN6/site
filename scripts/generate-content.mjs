// Generates src/generated/content-manifest.json from MDX files in
// content/mdx/{en,ru}/blog/ and content/mdx/{en,ru}/news/
//
// Usage: node scripts/generate-content.mjs
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
export const CONTENT_MDX_ROOT = path.join(ROOT, "content", "mdx");
export const GENERATED_CONTENT_MANIFEST = path.join(ROOT, "src", "generated", "content-manifest.json");

function parseFrontmatter(source) {
  const normalized = source.replace(/^\uFEFF/, "");
  if (!normalized.startsWith("---\n")) return { data: {}, content: normalized.trim() };
  const endIndex = normalized.indexOf("\n---\n", 4);
  if (endIndex === -1) return { data: {}, content: normalized.trim() };
  const rawFm = normalized.slice(4, endIndex);
  const body = normalized.slice(endIndex + 5).trim();
  const data = {};
  for (const line of rawFm.split("\n")) {
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    const value = line.slice(sep + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key) data[key] = value;
  }
  return { data, content: body };
}

async function readPostsFromDir(dir, lang, kind) {
  const posts = [];
  let entries;
  try {
    entries = await fs.readdir(dir);
  } catch {
    return posts;
  }
  for (const file of entries) {
    if (!file.endsWith(".mdx")) continue;
    const filePath = path.join(dir, file);
    const source = await fs.readFile(filePath, "utf8");
    const { data, content } = parseFrontmatter(source);
    const slug = data.slug?.trim() || file.replace(/\.mdx$/, "");
    posts.push({
      slug,
      title: data.title?.trim() || slug,
      excerpt: data.excerpt?.trim() || "",
      publishedAt: data.publishedAt?.trim() || "",
      content,
      lang,
      kind
    });
  }
  return posts.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export async function buildContentManifest() {
  const langs = ["en", "ru"];
  const manifest = { generatedAt: new Date().toISOString(), blog: {}, news: {} };

  for (const lang of langs) {
    manifest.blog[lang] = await readPostsFromDir(
      path.join(CONTENT_MDX_ROOT, lang, "blog"), lang, "blog"
    );
    manifest.news[lang] = await readPostsFromDir(
      path.join(CONTENT_MDX_ROOT, lang, "news"), lang, "news"
    );
  }

  return manifest;
}

async function main() {
  const manifest = await buildContentManifest();
  await fs.mkdir(path.dirname(GENERATED_CONTENT_MANIFEST), { recursive: true });
  await fs.writeFile(GENERATED_CONTENT_MANIFEST, JSON.stringify(manifest, null, 2));

  const blogCount = Object.values(manifest.blog).reduce((s, a) => s + a.length, 0);
  const newsCount = Object.values(manifest.news).reduce((s, a) => s + a.length, 0);
  console.log(`Generated content manifest: ${blogCount} blog posts, ${newsCount} news posts`);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
