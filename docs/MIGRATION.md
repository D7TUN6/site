# Migration Notes

This project has gone through two major migrations:

1. static HTML -> Next.js
2. Next.js -> Vite + Vue + Node API server

## Current Stack

- frontend: Vite + Vue + Vue Router
- backend: Node + Express (download queue API + static serving)
- content: raw MDX-like files in `content/mdx/<lang>/base`
- i18n: XML dictionaries in `public/locales`
- release metadata: generated JSON manifests from `public/media/music`

## Why Next.js Was Replaced

- simpler deployment/runtime model for this site
- explicit control over queue-based conversion API
- no framework-coupled SSR/runtime requirements

## Stable Routing Model

- `/` redirects to `/en`
- localized routes live under `/:lang/*`
- supported languages: `en`, `ru`

## Release Model

Release data is generated from `public/media/music/*`:

- `scripts/optimize-media.mjs` builds preview/stream tracks + playlists
- `scripts/generate-releases.mjs` builds:
  - `src/generated/release-manifest.json` (frontend)
  - `server/generated/release-download-data.json` (API)

Player track URLs are sourced from generated `full.m3u8` playlists.
