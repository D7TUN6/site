import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { ROOT, slugify } from './shared.js'

const MDX_DIR = (lang: string) => path.join(ROOT, 'content', 'mdx', lang, 'releases')

const RELEASE_TYPES = ['lp', 'ep', 'single', 'remaster', 'unrelease', 'demo', 'album']

const MUSIC_ROOT = path.join(ROOT, 'public', 'media', 'music')
const MANIFEST_PATH = path.join(ROOT, 'src', 'generated', 'release-manifest.json')
const COVER_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tiff', '.bmp'])
const TMP_DIR = path.join(ROOT, 'tmp')

mkdir(TMP_DIR, { recursive: true }).catch(() => {})

async function readManifest() {
  try {
    const raw = await readFile(MANIFEST_PATH, 'utf-8')
    const manifest = JSON.parse(raw) as { releases?: Array<{ slug: string; tracks?: Array<{ sourceUrl?: string; streamUrl?: string; title?: string; previewable?: boolean; isMain?: boolean }>; coverUrl?: string; coverPreviewUrl?: string; releaseDate?: string; releaseType?: string }> }
    return Array.isArray(manifest.releases) ? manifest.releases : []
  } catch { return [] }
}

async function getAlbumDir(slug: string): Promise<{ dir: string; name: string } | null> {
  const dirents = await readdir(MUSIC_ROOT, { withFileTypes: true }).catch(() => [])
  const existing = dirents.find((d) => d.isDirectory() && slugify(d.name) === slug)
  return existing ? { dir: path.join(MUSIC_ROOT, existing.name), name: existing.name } : null
}

async function writeReleaseMdx(slug: string, albumDir: string) {
  const manifestReleases = await readManifest()
  const mRelease = manifestReleases.find(r => r.slug === slug)
  if (!mRelease) return

  const albumName = path.basename(albumDir)

  let coverUrl = `/media/music/${albumName}/cover/cover.jpg`
  try {
    const files = await readdir(path.join(albumDir, 'cover'))
    const webp = files.find(f => f.endsWith('.webp') && !f.startsWith('cover-preview'))
    if (webp) coverUrl = `/media/music/${albumName}/cover/${webp}`
  } catch { /* cover directory may not exist */ }

  let notes = ''
  try { notes = await readFile(path.join(albumDir, 'notes', 'notes'), 'utf-8') } catch { /* notes file optional */ }

  const tracks = (mRelease.tracks ?? []).map((t, i) => ({
    index: i + 1,
    title: t.title ?? '',
    url: t.sourceUrl ?? '',
    streamUrl: t.streamUrl || t.sourceUrl || '',
  }))

  const trackJson = JSON.stringify(tracks.map(t => ({
    title: t.title,
    url: t.streamUrl || t.url,
  })), null, 2)

  function mdxContent(lang: string, genre: string, backText: string, notesTitle: string): string {
    const back = lang === 'en' ? `/en/music` : `/ru/music`
    const escapedNotes = notes.replace(/`/g, '\\`')
    const date = mRelease?.releaseDate ?? ''
    return `import ReleasePlayer from "@/components/ReleasePlayer.vue";

[← ${backText}](${back})

# ${albumName}

<ReleasePlayer albumSlug={"${slug}"} artist="D7TUN6" albumTitle={"${albumName.replace(/"/g, '\\"')}"} coverUrl={"${coverUrl}"} releaseDate={"${date}"} genre={"${genre}"} tracks={${trackJson}} />

<div class="release-notes">

## ${notesTitle}

\`\`\`text
${escapedNotes}
\`\`\`

</div>
`
  }

  const mdxEn = mdxContent('en', 'Electronic', 'Back to Discography', 'Notes')
  const mdxRu = mdxContent('ru', 'Электроника', 'Назад к дискографии', 'Заметки')

  await mkdir(MDX_DIR('en'), { recursive: true })
  await mkdir(MDX_DIR('ru'), { recursive: true })
  await writeFile(path.join(MDX_DIR('en'), `${slug}.mdx`), mdxEn, 'utf-8')
  await writeFile(path.join(MDX_DIR('ru'), `${slug}.mdx`), mdxRu, 'utf-8')
}

export {
  MDX_DIR, RELEASE_TYPES, MUSIC_ROOT, COVER_EXTS, TMP_DIR,
  readManifest, getAlbumDir, writeReleaseMdx,
}
