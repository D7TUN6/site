# Architecture

## Overview

The site uses:

- Vite + React 19 for frontend
- React Router for localized paths (`/en`, `/ru`)
- MDX for all page content
- Node + Express for runtime API and static serving
- generated release metadata/routes from filesystem

## Runtime Topology

Production process (`npm run start`):

1. serves static files from `dist/`
2. handles API under `/api/releases/download`
3. falls back all non-API paths to `dist/index.html` for SPA routing

Dev topology (`npm run dev`):

- Vite frontend on `3001`
- API server on `3002`
- Vite proxy forwards `/api/*` to API server

## Frontend Flow

1. `src/main.tsx` boots `BrowserRouter`.
2. `src/App.tsx` routes `/` to `/en`, and `/:lang/*` to `LocalizedPage`.
3. `src/pages/LocalizedPage.tsx`:
   - validates language
   - resolves route from slug via `src/lib/content.tsx`
   - loads dictionary from `src/lib/i18n.ts`
   - loads MDX module and renders inside `SiteFrame`

## Content Model

### Base pages

Stored in:

- `content/mdx/en/base/*.mdx`
- `content/mdx/ru/base/*.mdx`

Mapped in `src/lib/content.tsx`.

### Release pages

Generated from `public/media/music/*` by `scripts/generate-releases.mjs`.

Generated artifacts:

- `content/mdx/<lang>/releases/*.mdx`
- `content/mdx/<lang>/base/music.mdx`
- `src/lib/generated-release-routes.ts`
- `server/generated/release-download-data.json`

## Release Player

`src/components/ReleasePlayer.tsx` includes:

- custom album player UI
- track switching + auto-next playback
- queue-based download flow with modal progress

## Download Queue API

`server/index.mjs` provides:

- `POST /api/releases/download` - enqueue conversion job
- `GET /api/releases/download?jobId=...` - poll status/progress
- `GET /api/releases/download?jobId=...&download=1` - fetch final ZIP

Security and stability controls:

- strict slug lookup from generated metadata
- format allowlist (`flac`, `wav`, `mp3`, `ogg`)
- queue size and track count limits
- ffmpeg timeout per track
- no-store cache headers

## Localization

Dictionaries are XML files in:

- `public/locales/en.xml`
- `public/locales/ru.xml`

Loaded client-side by `src/lib/i18n.ts` and validated against schema shape.

## Styling

Main styling lives in `src/styles/globals.css` and includes:

- site frame / navigation
- release cards
- custom player + download modal
- release notes typography

## Deployment Notes

- `ffmpeg` is mandatory on host/container runtime.
- `container.nix` builds with `vite build` and starts `node server/index.mjs`.
- Nginx should proxy to the server port (`3001` in this setup).
