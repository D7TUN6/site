# d7tun6.site (Vite + React)

Personal D7TUN6's website.
Vite + React with MDX-driven content, XML-based i18n, release pages generator, custom audio player, and queued download conversion API.

## Requirements

- Node.js 22+
- npm 10+
- `ffmpeg` (required for release download conversion API)

## Development

```bash
npm install
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
- `npm run generate:releases` - regenerate release MDX + generated route/data artifacts
- `npm run lint` - ESLint checks
- `npm run typecheck` - TypeScript checks
- `npm run build` - regenerate releases + build Vite frontend
- `npm run start` - start production Node server
- `npm run test` - lint + typecheck + build
- `npm run sanitize:check` - preview cleanup before publishing to GitHub
- `npm run sanitize:github` - remove build/cache/local junk before publishing to GitHub

## Project Structure

- `src/` - client app (router, components, i18n/content loaders, styles)
- `src/lib/content.tsx` - route resolution and MDX module loading
- `src/lib/i18n.ts` - XML dictionary loader from `public/locales`
- `src/lib/generated-release-routes.ts` - generated release route map
- `server/index.mjs` - Node server (API + static serving)
- `server/generated/release-download-data.json` - generated release metadata for API
- `content/mdx/<lang>/base/` - base pages (`main`, `bio`, `music`, etc.)
- `content/mdx/<lang>/releases/` - generated release pages
- `scripts/generate-releases.mjs` - release MDX/data generator
- `public/media/music/` - music source assets (cover, notes, tracks)
- `public/locales/*.xml` - UI dictionaries
- `docs/` - project documentation

## Operations Notes

- `/` redirects to `/en` in client router.
- Download API supports `flac`, `wav`, `mp3`, `ogg` (Opus VBR).
- Download API uses an in-memory queue with status polling and final archive pickup.
- `ffmpeg` must be available in runtime PATH.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Add New Section / New Release](docs/ADDING_CONTENT.md)
- [Contributing Guide](docs/CONTRIBUTING.md)
- [Migration Notes](docs/MIGRATION.md)
