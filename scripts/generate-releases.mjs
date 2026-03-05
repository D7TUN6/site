import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MUSIC_ROOT = path.join(ROOT, "public", "media", "music");
const EN_BASE_MUSIC = path.join(ROOT, "content", "mdx", "en", "base", "music.mdx");
const RU_BASE_MUSIC = path.join(ROOT, "content", "mdx", "ru", "base", "music.mdx");
const EN_RELEASES_DIR = path.join(ROOT, "content", "mdx", "en", "releases");
const RU_RELEASES_DIR = path.join(ROOT, "content", "mdx", "ru", "releases");
const GENERATED_ROUTES = path.join(ROOT, "src", "lib", "generated-release-routes.ts");
const GENERATED_RELEASE_DATA = path.join(ROOT, "server", "generated", "release-download-data.json");

const TRACK_EXT = new Set([".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac"]);
const COVER_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, (m) => ` ${m.slice(1, -1)} `)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

function toPublicUrl(absPath) {
  const rel = path.relative(path.join(ROOT, "public"), absPath);
  const normalized = rel.split(path.sep).join("/");
  return `/${normalized}`;
}

function normalizeTrackTitle(fileName) {
  const noExt = fileName.replace(/\.[^.]+$/, "");
  return noExt.replace(/^\s*\d+\s*-\s*/, "").trim();
}

function sortTracksNatural(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function sortAlbums(a, b) {
  const aDeluxe = /\(deluxe analog edition\)/i.test(a.albumName);
  const bDeluxe = /\(deluxe analog edition\)/i.test(b.albumName);
  const aBase = a.albumName.replace(/\s*\(deluxe analog edition\)\s*/i, "").trim();
  const bBase = b.albumName.replace(/\s*\(deluxe analog edition\)\s*/i, "").trim();
  const byBase = aBase.localeCompare(bBase, undefined, { sensitivity: "base" });
  if (byBase !== 0) return byBase;
  return Number(aDeluxe) - Number(bDeluxe);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatDate(date) {
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function normalizeYear(yearRaw) {
  const year = Number(yearRaw);
  if (!Number.isFinite(year)) return null;
  if (yearRaw.length === 2) return 2000 + year;
  return year;
}

function parseReleaseDateFromNotes(notes) {
  if (!notes) return null;

  const candidates = [
    /(?:^|\n)\s*released\s+(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/im,
    /(?:^|\n)\s*релиз(?:\s+состоялся)?\s+(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/im,
    /(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/
  ];

  for (const re of candidates) {
    const match = notes.match(re);
    if (!match) continue;
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = normalizeYear(match[3]);
    if (!year) continue;
    if (day < 1 || day > 31 || month < 1 || month > 12) continue;
    return `${pad2(day)}/${pad2(month)}/${year}`;
  }

  return null;
}

async function readAlbums() {
  const dirents = await fs.readdir(MUSIC_ROOT, { withFileTypes: true });
  const albums = [];

  for (const d of dirents) {
    if (!d.isDirectory()) continue;
    const albumDir = path.join(MUSIC_ROOT, d.name);
    const coverDir = path.join(albumDir, "cover");
    const tracksDir = path.join(albumDir, "tracks");
    const tracksWavDir = path.join(tracksDir, "wav");
    const notesFile = path.join(albumDir, "notes", "notes");

    let coverPath = null;
    try {
      const covers = (await fs.readdir(coverDir))
        .filter((f) => COVER_EXT.has(path.extname(f).toLowerCase()))
        .sort(sortTracksNatural);
      if (covers.length > 0) coverPath = path.join(coverDir, covers[0]);
    } catch (error) {
      void error;
    }

    let tracks = [];
    try {
      let tracksSourceDir = tracksDir;
      try {
        const wavStat = await fs.stat(tracksWavDir);
        if (wavStat.isDirectory()) {
          tracksSourceDir = tracksWavDir;
        }
      } catch (error) {
        void error;
      }

      const trackFiles = (await fs.readdir(tracksSourceDir))
        .filter((f) => TRACK_EXT.has(path.extname(f).toLowerCase()))
        .sort(sortTracksNatural);
      const numberedTracks = trackFiles.filter((name) => /^\s*\d+\s*-\s*/.test(name));
      const selectedTracks =
        numberedTracks.length > 0
          ? trackFiles.filter((name) => /^\s*\d+\s*-\s*/.test(name) || /^master\./i.test(name))
          : trackFiles;

      for (const fileName of selectedTracks) {
        const abs = path.join(tracksSourceDir, fileName);
        const stat = await fs.stat(abs);
        const sourceFilePath = path
          .relative(albumDir, abs)
          .split(path.sep)
          .join("/");
        const ext = path.extname(fileName).toLowerCase();
        let mime = "audio/wav";
        if (ext === ".mp3") mime = "audio/mpeg";
        else if (ext === ".flac") mime = "audio/flac";
        else if (ext === ".ogg") mime = "audio/ogg";
        else if (ext === ".m4a") mime = "audio/mp4";
        else if (ext === ".aac") mime = "audio/aac";

        tracks.push({
          fileName,
          title: normalizeTrackTitle(fileName),
          url: toPublicUrl(abs),
          mime,
          sourceFilePath,
          sizeBytes: stat.size
        });
      }
    } catch (error) {
      void error;
    }

    let notes = "";
    try {
      notes = (await fs.readFile(notesFile, "utf8")).trim();
    } catch (error) {
      void error;
    }

    let releaseDate = parseReleaseDateFromNotes(notes);
    if (!releaseDate) {
      try {
        const stat = await fs.stat(notesFile);
        releaseDate = formatDate(stat.mtime);
      } catch {
        const stat = await fs.stat(albumDir);
        releaseDate = formatDate(stat.mtime);
      }
    }

    albums.push({
      albumName: d.name,
      slug: slugify(d.name),
      sourceDirName: d.name,
      coverUrl: coverPath ? toPublicUrl(coverPath) : null,
      tracks,
      notes,
      releaseDate
    });
  }

  albums.sort(sortAlbums);
  return albums;
}

function buildReleaseMdx({ lang, albumName, coverUrl, tracks, notes, releaseDate, slug }) {
  const isRu = lang === "ru";
  const back = isRu ? "Назад к дискографии" : "Back to Discography";
  const notesTitle = isRu ? "Заметки" : "Notes";
  const noTracks = isRu ? "Треки не найдены в папке `tracks`." : "No tracks found in `tracks` folder.";
  const trackRows = tracks.map((t) => ({ title: t.title, url: t.url }));
  const tracksLiteral = JSON.stringify(trackRows, null, 2);
  const safeCover = coverUrl ?? "/media/background/bg.jpg";
  const genreLabel = isRu ? "Электроника" : "Electronic";

  const lines = [];
  lines.push('import ReleasePlayer from "@/components/ReleasePlayer";');
  lines.push("");
  lines.push(`[← ${back}](/${lang}/music)`);
  lines.push("");
  lines.push(`# ${albumName}`);
  lines.push("");
  lines.push(
    `<ReleasePlayer albumSlug={${JSON.stringify(slug)}} artist="D7TUN6" albumTitle={${JSON.stringify(
      albumName
    )}} coverUrl={${JSON.stringify(safeCover)}} releaseDate={${JSON.stringify(
      releaseDate
    )}} genre={${JSON.stringify(genreLabel)}} tracks={${tracksLiteral}} />`
  );
  lines.push("");
  if (tracks.length === 0) lines.push(noTracks);
  if (tracks.length === 0) lines.push("");

  lines.push(`<div className="release-notes">`);
  lines.push("");
  lines.push(`## ${notesTitle}`);
  lines.push("");
  if (notes) {
    lines.push("```text");
    lines.push(notes);
    lines.push("```");
  } else {
    lines.push(isRu ? "Заметки не найдены." : "Notes not found.");
  }
  lines.push("");
  lines.push("</div>");
  lines.push("");

  return lines.join("\n");
}

function buildMusicIndexMdx({ lang, albums }) {
  const isRu = lang === "ru";
  const title = isRu ? "Музыка" : "Music";
  const lines = [`# ${title}`, "", "<div className='music-grid'>"];

  for (const album of albums) {
    const href = `/${lang}/music/${album.slug}`;
    const cover = album.coverUrl ?? "/media/background/bg.jpg";
    lines.push(`  <a href='${href}' className='release-card'>`);
    lines.push(`    <img src='${cover}' alt='${album.albumName}' className='release-cover' />`);
    lines.push(`    <span className='release-title'>${album.albumName}</span>`);
    lines.push("  </a>");
    lines.push("");
  }

  lines.push("</div>");
  lines.push("");
  return lines.join("\n");
}

function buildGeneratedRoutesTs(albums) {
  const routes = albums.map((a) => `music/${a.slug}`);
  const routeLiterals = routes.map((r) => `  "${r}"`).join(",\n");

  const enMap = routes
    .map((r) => {
      const slug = r.replace("music/", "");
      return `    "${r}": () => import("../../content/mdx/en/releases/${slug}.mdx")`;
    })
    .join(",\n");

  const ruMap = routes
    .map((r) => {
      const slug = r.replace("music/", "");
      return `    "${r}": () => import("../../content/mdx/ru/releases/${slug}.mdx")`;
    })
    .join(",\n");

  return `import type { ComponentType } from "react";\n\nexport const releaseRoutes = [\n${routeLiterals}\n] as const;\n\nexport type ReleaseRoute = (typeof releaseRoutes)[number];\n\ntype MdxModule = {\n  default: ComponentType;\n};\n\nexport const releaseContentModuleMap: Record<"en" | "ru", Record<ReleaseRoute, () => Promise<MdxModule>>> = {\n  en: {\n${enMap}\n  },\n  ru: {\n${ruMap}\n  }\n};\n`;
}

function buildGeneratedReleaseDownloadDataJson(albums) {
  return albums.map((album) => ({
    slug: album.slug,
    albumName: album.albumName,
    sourceDirName: album.sourceDirName,
    coverUrl: album.coverUrl ?? "/media/background/bg.jpg",
    releaseDate: album.releaseDate,
    tracks: album.tracks.map((track, index) => ({
      index: index + 1,
      title: track.title,
      fileName: track.fileName,
      sourceFilePath: track.sourceFilePath,
      sizeBytes: track.sizeBytes
    }))
  }));
}

async function main() {
  await fs.mkdir(EN_RELEASES_DIR, { recursive: true });
  await fs.mkdir(RU_RELEASES_DIR, { recursive: true });

  const albums = await readAlbums();

  for (const dir of [EN_RELEASES_DIR, RU_RELEASES_DIR]) {
    const files = await fs.readdir(dir);
    await Promise.all(files.filter((f) => f.endsWith(".mdx")).map((f) => fs.unlink(path.join(dir, f))));
  }

  for (const album of albums) {
    const en = buildReleaseMdx({ lang: "en", ...album });
    const ru = buildReleaseMdx({ lang: "ru", ...album });
    await fs.writeFile(path.join(EN_RELEASES_DIR, `${album.slug}.mdx`), en);
    await fs.writeFile(path.join(RU_RELEASES_DIR, `${album.slug}.mdx`), ru);
  }

  await fs.writeFile(EN_BASE_MUSIC, buildMusicIndexMdx({ lang: "en", albums }));
  await fs.writeFile(RU_BASE_MUSIC, buildMusicIndexMdx({ lang: "ru", albums }));

  await fs.writeFile(GENERATED_ROUTES, buildGeneratedRoutesTs(albums));
  await fs.mkdir(path.dirname(GENERATED_RELEASE_DATA), { recursive: true });
  await fs.writeFile(
    GENERATED_RELEASE_DATA,
    JSON.stringify(buildGeneratedReleaseDownloadDataJson(albums), null, 2)
  );

  console.log(`Generated ${albums.length} releases`);
  for (const a of albums) {
    console.log(`- ${a.albumName} -> ${a.slug} (${a.tracks.length} tracks)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
