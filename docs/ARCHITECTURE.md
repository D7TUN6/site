# Architecture

## Overview

The site uses:

- Vite + Vue 3 frontend
- Vue Router for localized paths (`/en`, `/ru`)
- raw markdown-like content from `content/mdx/*` rendered via `markdown-it` + `DOMPurify`
- Node + Express for API and static serving
- generated release metadata from `public/media/music/*`

## Runtime Topology

Production process (`npm run start`):

1. serves static files from `dist/`
2. handles API under `/api/releases/download`
3. falls back non-API paths to `dist/index.html` for SPA routing

Dev topology (`npm run dev`):

- Vite frontend on `3001`
- API server on `3002`
- Vite proxy forwards `/api/*` to API server

## Frontend Flow

1. `src/main.ts` creates Vue app and mounts router.
2. `src/router/index.ts` redirects `/` to `/en` and maps `/:lang/:pathMatch(.*)*` to `LocalizedPage`.
3. `src/views/LocalizedPage.vue`:
   - validates language
   - resolves route slug via `src/lib/content.ts`
   - loads locale dictionary via `src/lib/i18n.ts`
   - loads route payload and renders markdown/music index/release view
4. `src/components/SiteFrame.vue` renders layout + nav + `NowPlayingBar`.

## Content Model

Base pages:

- `content/mdx/en/base/*.mdx`
- `content/mdx/ru/base/*.mdx`

Releases:

- runtime release pages come from `src/generated/release-manifest.json`
- source assets come from `public/media/music/<Album Name>/...`

## Release Generation Pipeline

1. `scripts/optimize-media.mjs`
   - generates cover preview (`cover-preview.webp`)
   - generates preview tracks (`tracks/preview/*.ogg`)
   - generates full stream tracks (`tracks/stream/*.ogg`)
   - generates playlists (`playlists/full.m3u`, `playlists/full.m3u8`, preview variants)
2. `scripts/generate-releases.mjs`
   - builds backend metadata: `server/generated/release-download-data.json`
   - builds frontend manifest: `src/generated/release-manifest.json`
   - uses `full.m3u8` as source of player track URLs
   - syncs generated release MDX `tracks=[...]` URLs to the same M3U8-derived stream URLs

## Player Model

- global player state is in `src/composables/usePlayer.ts` (single `Audio` instance)
- release player UI is in `src/components/ReleasePlayer.vue`
- bottom queue/player is in `src/components/NowPlayingBar.vue`
- playback queue URLs are generated from `full.m3u8`, not raw source tracks

## Download Queue API

`server/index.mjs` provides:

- `POST /api/releases/download` - enqueue conversion job
- `GET /api/releases/download?jobId=...` - poll status/progress
- `GET /api/releases/download?jobId=...&download=1` - fetch ZIP

Controls:

- strict slug lookup from generated metadata
- format allowlist (`flac`, `wav`, `mp3`, `ogg`)
- queue size and track count limits
- ffmpeg timeout per track
- `no-store` response policy for queue/download endpoints

## Localization

Dictionaries are XML files in:

- `public/locales/en.xml`
- `public/locales/ru.xml`

Loaded client-side by `src/lib/i18n.ts`.

## Styling

Main styling lives in `src/styles/globals.css`.
