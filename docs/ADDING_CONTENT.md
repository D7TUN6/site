# Adding Content

This document covers:

1. adding a new base site section
2. adding/updating a music release

## 1. Add a New Base Section

Example target route: `/en/projects` and `/ru/projects`.

### Step 1: Create MDX files

Create:

- `content/mdx/en/base/projects.mdx`
- `content/mdx/ru/base/projects.mdx`

### Step 2: Register route loading

Edit `src/lib/content.tsx`:

- add `"projects"` to `BaseRoute`
- add dynamic imports for both languages in `baseContentModuleMap`
- add `"projects"` into `baseRoutes`

### Step 3: Add navigation labels

Edit XML dictionaries:

- `public/locales/en.xml`
- `public/locales/ru.xml`

Add `<projects>` labels under `<nav>`.

### Step 4: Add section to navigation

Edit `src/components/SiteFrame.tsx`:

- add `{ id: "projects", key: "projects" }` to `navItems`.

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

- If numbered tracks exist, generator prioritizes numbered tracks (plus optional `master.*`).
- Release date is parsed from notes (e.g. `released 05.03.26`) with fallback to timestamps.

### Regenerate pages and generated metadata

```bash
npm run generate:releases
```

This updates:

- `content/mdx/en/releases/*.mdx`
- `content/mdx/ru/releases/*.mdx`
- `content/mdx/en/base/music.mdx`
- `content/mdx/ru/base/music.mdx`
- `src/lib/generated-release-routes.ts`
- `server/generated/release-download-data.json`

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

`ffmpeg` must be available on the runtime host.
