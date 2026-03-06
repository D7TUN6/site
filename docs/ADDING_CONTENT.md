# Adding Content

This document covers:

1. adding a new base site section
2. adding/updating a music release

## 1. Add a New Base Section

Example route: `/en/projects` and `/ru/projects`.

### Step 1: Create content files

Create:

- `content/mdx/en/base/projects.mdx`
- `content/mdx/ru/base/projects.mdx`

### Step 2: Register route loading

Edit `src/lib/content.ts`:

- add `"projects"` to `BaseRoute`
- add dynamic imports for both languages in `baseContentModuleMap`
- add `"projects"` to `baseRoutes`

### Step 3: Add dictionary labels

Edit:

- `public/locales/en.xml`
- `public/locales/ru.xml`

Add `<projects>` labels under `<nav>`.

### Step 4: Add section to navigation

Edit `src/components/SiteFrame.vue`:

- add `{ id: "projects", key: "projects" }` to `navItems`

### Step 5: Validate

```bash
npm run lint
npm run typecheck
npm run build
```

## 2. Add or Update a Release

Releases are generated from filesystem assets in `public/media/music`.

### Required layout per album

```text
public/media/music/<Album Name>/
  cover/
    cover.jpg (or png/webp/avif)
  notes/
    notes
  tracks/
    wav/
      1 - Track Name.wav
      2 - Track Name.wav
      ...
```

Notes:

- if numbered tracks exist, generator prioritizes numbered tracks (plus optional `master.*`)
- release date is parsed from notes (e.g. `released 05.03.26`) with fallback to timestamps
- player URLs are generated from `playlists/full.m3u8`

### Regenerate media + manifests

```bash
npm run optimize:media
npm run generate:releases
```

This updates:

- `src/generated/release-manifest.json`
- `server/generated/release-download-data.json`
- `content/mdx/<lang>/releases/*.mdx` track URL blocks (synced to M3U8-derived stream URLs)

### Validate

```bash
npm run lint
npm run typecheck
npm run build
```

## Download API Formats

`/api/releases/download` supports:

- `flac` - 16-bit / 44.1kHz
- `wav` - PCM s16le / 44.1kHz
- `mp3` - 320 kbps / 44.1kHz
- `ogg` - Opus VBR / 48kHz

`ffmpeg` must be available on runtime host.
