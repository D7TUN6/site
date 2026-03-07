# Architecture

## Overview

`site` is a filesystem-driven artist website.

- pages are localized under `/en` and `/ru`
- static text pages come from `content/mdx/<lang>/base`
- release pages come from generated JSON manifests
- audio is streamed as HLS from files generated at build time
- downloads are transcoded on demand by the Node server

## Runtime Shape

Development:

- Vite frontend: `127.0.0.1:3001`
- Express API: `127.0.0.1:3002`
- Vite proxies `/api/*` to the API server

Production:

- `npm run start` serves the built SPA from `dist/`
- `/api/releases/download` remains dynamic
- non-API routes fall back to `dist/index.html`

## Frontend

Main path:

1. `src/main.ts` mounts the app
2. `src/router/index.ts` resolves localized routes
3. `src/views/LocalizedPage.vue` loads dictionary + route payload
4. `src/components/SiteFrame.vue` renders the shell
5. release routes render `src/components/ReleasePlayer.vue`
6. global playback UI lives in `src/components/NowPlayingBar.vue`

## Content Sources

Base pages:

- `content/mdx/en/base/*.mdx`
- `content/mdx/ru/base/*.mdx`

Generated release data:

- `src/generated/release-manifest.json`
- `server/generated/release-download-data.json`

Localization:

- `public/locales/en.xml`
- `public/locales/ru.xml`

## Release Pipeline

### 1. Media preparation

`scripts/optimize-media.mjs`:

- extracts embedded artwork if `cover/` is missing
- creates `cover-preview.webp`
- creates preview `ogg`
- creates HLS stream output in `tracks/stream/<track>/index.m3u8`
- creates release playlists in `playlists/`

### 2. Manifest generation

`scripts/generate-releases.mjs`:

- scans `public/media/music`
- reads notes, covers, track lists, durations, and optional `links.json`
- writes frontend and backend manifests
- keeps release MDX track blocks in sync where those files exist

## Player

Global player state is in `src/composables/usePlayer.ts`.

- one shared `Audio` instance
- HLS playback via `hls.js`
- fullscreen player from the bottom bar
- track platform badges pulled from release metadata

## Download API

`server/index.mjs` exposes:

- `POST /api/releases/download`
- `GET /api/releases/download?jobId=...`
- `GET /api/releases/download?jobId=...&download=1`

The server validates the release slug, enforces format allowlists, limits queue pressure, runs `ffmpeg`, and returns a ZIP when done.
