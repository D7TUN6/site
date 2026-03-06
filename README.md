# d7tun6.site (Vite + Vue)

Personal D7TUN6's website.
Vite + Vue with XML-based i18n, release manifest generator, global audio player, media optimization pipeline (preview + stream + M3U/M3U8), and queued download conversion API.

## Requirements

- Node.js 24+
- npm 10+
- `ffmpeg` (required for media optimization and release download conversion API)

## Development

```bash
npm install
npm run optimize:media
npm run generate:releases
npm run dev
```

- Frontend (Vite): `http://127.0.0.1:3001`
- API server (queue/conversion): `http://127.0.0.1:3002`

Vite dev server proxies `/api/*` to `3002`.

## Production Run

```bash
npm install
npm run build
npm run start
```

Server listens on `HOSTNAME` / `PORT` (defaults to `127.0.0.1:3001`) and serves:

- static SPA from `dist/`
- API endpoints under `/api/releases/download`

## Scripts

- `npm run dev` - run Vite + API server in parallel
- `npm run dev:web` - run only Vite dev server
- `npm run dev:api` - run only API server in dev mode
- `npm run optimize:media` - generate cover previews, preview tracks, full stream tracks (`tracks/stream/*.ogg`), and M3U/M3U8 playlists
- `npm run optimize:media:full` - alias for `npm run optimize:media` (kept for compatibility)
- `npm run generate:releases` - regenerate backend download metadata + frontend release manifest (player tracks are sourced from `full.m3u8`)
- `npm run lint` - ESLint checks
- `npm run typecheck` - Vue + TypeScript checks
- `npm run build` - optimize media + regenerate release metadata + build Vite frontend
- `npm run start` - start production Node server
- `npm run test` - lint + typecheck + build
- `npm run sanitize:check` - preview cleanup before publishing to GitHub
- `npm run sanitize:github` - remove build/cache/local junk before publishing to GitHub

## Project Structure

- `src/` - client app (router, components, i18n/content loaders, styles)
- `src/lib/content.ts` - route resolution and content payload loading
- `src/lib/i18n.ts` - XML dictionary loader from `public/locales`
- `src/generated/release-manifest.json` - generated release manifest for frontend routes/player
- `server/index.mjs` - Node server (API + static serving)
- `server/generated/release-download-data.json` - generated release metadata for API
- `content/mdx/<lang>/base/` - base pages content source (raw markdown-like input)
- `scripts/optimize-media.mjs` - media optimization pipeline (cover preview + preview/stream audio + playlists)
- `scripts/generate-releases.mjs` - frontend/backend release manifest generator + release MDX `tracks=[...]` sync to M3U8-derived URLs
- `public/media/music/` - music source assets (cover, notes, tracks)
- `public/locales/*.xml` - UI dictionaries
- `docs/` - project documentation

## Operations Notes

- `/` redirects to `/en` in client router.
- Static build now includes precompressed `.br` + `.gz` assets and server-side precompressed delivery.
- API protected with Helmet headers, same-origin check on conversion POST, stricter input validation, and rate limiting.
- Download API supports `flac`, `wav`, `mp3`, `ogg` (Opus VBR).
- Download API uses an in-memory queue with status polling and final archive pickup.
- Player queue uses release tracks generated from `full.m3u8` (no runtime fallback to raw source tracks).
- `ffmpeg` must be available in runtime PATH.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Add New Section / New Release](docs/ADDING_CONTENT.md)
- [Contributing Guide](docs/CONTRIBUTING.md)
- [Migration Notes](docs/MIGRATION.md)
