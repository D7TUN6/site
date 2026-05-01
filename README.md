<div align="center">
  <img src=".github/assets/dvigoon-avatar.jpg" alt="D7TUN6 avatar" width="120" />

  <h1>d7tun6.site</h1>
  <p>Personal artist website for D7TUN6.</p>
  <p>Music, notes, release pages, blog posts, streaming links, and a fullscreen player.</p>
</div>

<p align="center">
  <a href="https://open.spotify.com/artist/3kxsK6GeWVOpm90RqqfYZy"><img src="public/media/image/spotify-badge.png" alt="Spotify" height="44" /></a>&nbsp;&nbsp;
  <a href="https://music.yandex.ru/artist/25225583"><img src="public/media/image/yandex-badge.png" alt="Yandex Music" height="44" /></a>&nbsp;&nbsp;
  <a href="https://d7tun6.bandcamp.com"><img src="public/media/image/bandcamp-badge.png" alt="Bandcamp" height="44" /></a>&nbsp;&nbsp;
  <a href="https://soundcloud.com/d7tun6"><img src="public/media/image/soundcloud-badge.webp" alt="SoundCloud" height="42" /></a>
</p>

<br />

## Stack

- Vue 3 + Vite
- Vue Router
- Express
- `ffmpeg` / `ffprobe`
- filesystem-generated release manifests

## What It Does

- localized site under `/en` and `/ru`
- music release pages generated from `public/media/music`
- HLS audio streaming with segmented playback
- fullscreen now-playing player
- release ZIP downloads via queued server-side transcoding
- blog index + per-post routes from local MDX files
- shop: product pages, cart, checkout + YooKassa widget payments
- email+password auth with email code verification
- user account page with order status + tracking
- admin panel for managing orders / tracking
- automatic cover extraction from embedded track artwork when no cover file exists

## Quick Start

Requirements:

- Node.js 24+
- npm 10+
- `ffmpeg` and `ffprobe` in `PATH`

Install and run development inside `nix-shell`:

```bash
nix-shell --run "cp .env.example .env"
# edit .env before running (APP_SECRET + SMTP + admin creds at minimum)
nix-shell --run "npm install"
nix-shell --run "npm run dev"
```

Open:

- web: `http://127.0.0.1:3001` (override with `WEB_PORT`)
- api in dev: `http://127.0.0.1:3002` (override with `API_PORT`)

## Production

```bash
nix-shell --run "cp .env.example .env"
# edit .env before running (APP_SECRET + SMTP + admin creds at minimum)
nix-shell --run "npm install"
nix-shell --run "npm run build"
nix-shell --run "npm run start"
```

The production server serves the built SPA from `dist/` and the release download API from `/api/releases/download`.

### Shop configuration

- Env vars live in `.env` (see `.env.example`).
- YooKassa webhook URL: `/api/payments/yookassa/webhook`
- Pickup point lookup uses Yandex Maps Search API (set `YANDEX_MAPS_API_KEY`).

Note: for real sales in РФ you may need to configure receipts / fiscalization (54‑ФЗ) in YooKassa. This project currently creates payments without receipt data.

## Main Scripts

- `npm run prepare:media` rebuild cover previews, HLS streams, previews, and release manifests
- `npm run generate:seo` generate `public/robots.txt` + `public/sitemap.xml` (set `SITE_ORIGIN` to override the default origin)
- `npm run stats:vite` build + write bundle report to `tmp/vite-bundle-report.html` (override with `STATS_PATH`)
- `npm run dev` run site + API locally
- `npm run build` rebuild media and create production bundle
- `npm run start` run production server
- `npm run lint` run ESLint
- `npm run typecheck` run Vue TypeScript checks
- `npm run test` run lint + typecheck + build

## Release Layout

Each release lives under:

```text
public/media/music/<Album Name>/
  cover/
    cover.jpg           # main cover image
    cover-preview.webp  # optimized preview
  notes/
    notes               # release notes text file
  tracks/
    *.wav               # source WAV files (in root tracks/ dir)
    wav/                # optional additional WAV files
    flac/               # empty (source files may include FLAC)
    mp3/                # empty (generated on-demand)
    ogg/                # empty (generated on-demand)
    opus/               # empty (generated on-demand)
    preview/            # generated OGG preview files
    stream/             # generated HLS streaming segments
  playlists/            # generated M3U/M3U8 playlists
    full.m3u8
    full.m3u
    preview.m3u8
    preview.m3u
  links.json            # optional release + track platform links
```

## File Storage

**Source Files:**
- Original tracks: `public/media/music/{Album Name}/tracks/*.wav`
- Some albums may have FLAC files mixed with WAV files
- Cover images and metadata stored alongside tracks

**Generated/Cached Files:**
- ZIP downloads: `tmp/media-cache/releases/zips/{album-slug}/{album-slug}-{format}.zip`
- Individual track downloads: `tmp/media-cache/music/{Album Name}/tracks/download/{format}/{track-name}.{ext}`
- HLS streaming files: `public/media/music/{Album Name}/tracks/stream/{track-slug}/`
- Preview files: `public/media/music/{Album Name}/tracks/preview/{track-slug}.ogg`

**Serving:**
- Media cache served at `/media-cache/` endpoint
- Public media served directly from `/media/` endpoint

Minimal `links.json` example:

```json
{
  "release": {
    "bandcamp": "https://d7tun6.bandcamp.com"
  },
  "tracks": {
    "01 - Track Name.wav": {
      "spotify": "https://open.spotify.com/...",
      "yandexMusic": "https://music.yandex.ru/...",
      "bandcamp": "https://bandcamp.com/...",
      "soundcloud": "https://soundcloud.com/..."
    }
  }
}
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Content Workflow](docs/ADDING_CONTENT.md)
- [Working On The Project](docs/CONTRIBUTING.md)
- [Migration Notes](docs/MIGRATION.md)
