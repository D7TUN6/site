<div align="center">
  <img src=".github/assets/d7tun6-avatar.jpg" alt="D7TUN6 avatar" width="120" />

  <h1>d7tun6.site</h1>
  <p>Personal artist website for D7TUN6.</p>
  <p>Music, notes, release pages, blog posts, streaming links, shop, auth, and a fullscreen player.</p>
</div>

<p align="center">
  <a href="https://open.spotify.com/artist/3kxsK6GeWVOpm90RqqfYZy"><img src=".github/assets/spotify-badge.png" alt="Spotify" height="44" /></a>&nbsp;&nbsp;
  <a href="https://music.yandex.ru/artist/25225583"><img src=".github/assets/yandex-badge.png" alt="Yandex Music" height="44" /></a>&nbsp;&nbsp;
  <a href="https://d7tun6.bandcamp.com"><img src=".github/assets/bandcamp-badge.png" alt="Bandcamp" height="44" /></a>&nbsp;&nbsp;
  <a href="https://soundcloud.com/d7tun6"><img src=".github/assets/soundcloud-badge.webp" alt="SoundCloud" height="42" /></a>
</p>

<br />

## Stack

- SolidJS + Vite
- Express
- SQLite
- `sharp` — image resize & format conversion (WebP, AVIF)
- `ffmpeg` / `ffprobe` — HLS audio/video transcoding & thumbnails
- filesystem-generated content (no database for media)

## What It Does

- localized site under `/en` and `/ru`
- music release pages generated from `public/media/music`
- HLS audio streaming with segmented playback
- fullscreen now-playing player
- release ZIP and track downloads with on-demand ffmpeg conversion (6 formats, sample rate, bit depth, channels, resampler, bitrate controls)
- blog index + per-post routes
- shop: product pages, cart, checkout + YooKassa widget payments
- email/password auth
- user account page with order history
- gallery with tag filtering, lightbox, and per-entry pages
- video catalogue with source-format resolution
- internet radio with schedule, listener count, HLS streaming
- file/storage browser (list, upload, create, delete, read, write)
- admin panel for managing orders, gallery, video, radio, shop, releases, storage, and media conversion

## Quick Start

Requirements:

- Node.js 24+
- npm 10+
- `ffmpeg` and `ffprobe` in `PATH`

Install dependencies:

```bash
npm install
```

Run frontend only:

```bash
npm run dev
```

Run frontend + API together:

```bash
npm run dev:all
```

Open:

- web: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:3001`

## Production

```bash
npm run build
npm run start
```

The production server serves the built SPA from `dist/` and the API from `/api/*`.

## Environment

Copy `.env.example` to `.env` and fill it in.

Required:

- `APP_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

Recommended for production:

- `APP_ORIGIN`
- `DB_PATH`
- `COOKIE_DOMAIN` if you need cookies across subdomains

Needed for shipping and payments:

- `YANDEX_MAPS_SEARCH_API_KEY`
- `YOOKASSA_SHOP_ID`
- `YOOKASSA_SECRET_KEY`
- `YOOKASSA_RETURN_URL`

Optional:

- `PORT` default `3001`
- `HOSTNAME` default `127.0.0.1`
- `YANDEX_MAPS_JS_API_KEY` or `YANDEX_MAPS_API_KEY`

## Main Scripts

- `npm run dev` run Vite locally
- `npm run dev:all` run API + Vite
- `npm run build` create production bundle (client + server)
- `npm run start` full production build + start
- `npm run start:api` API only (skip client build)
- `npm run generate:releases` rebuild release manifests
- `npm run generate:shop` rebuild shop data
- `npm run build:server` compile server TypeScript
- `npm run lint` run ESLint
- `npm run test` run vitest suite (client + server tests)
- `npm run typecheck` run TypeScript checks

## Release Layout

Each release lives under:

```text
public/media/music/<Album Name>/
  cover/
    cover.jpg
    cover-preview.webp
  notes/
    notes
  tracks/
    *.wav
    wav/
    flac/
    mp3/
    ogg/
    opus/
    preview/
    stream/
  playlists/
    full.m3u8
    full.m3u
    preview.m3u8
    preview.m3u
  links.json
```

## Content Modules

### Gallery

Entries live under `public/media/gallery/<slug>/index.mdx`.

Frontmatter:
```
---
title: "Entry title"
date: "2025-01-01"
tags: [concert, live]
cover: cover.jpg
images: [img1.jpg, img2.jpg]
---
```

Images are converted to WebP/AVIF on upload; previews (400px WebP) generated automatically.

### Video

Entries live under `public/media/video/<slug>/index.mdx`.

Frontmatter:
```
---
title: "Video title"
date: "2025-01-01"
duration: 120
thumbnail: thumb.webp
sources:
  - url: /media/video/example/hls/index.m3u8, type: application/x-mpegURL
  - url: /media/video/example/video.mp4, type: video/mp4, resolution: 1080p
---
```

Uploaded videos are transcoded to HLS (AAC audio, H.264 video) with a thumbnail generated via `ffmpeg`.

### Radio

State and schedule served from `public/media/radio/schedule.json`. Stream segments in `public/media/radio/segments/`. Listener counting via POST `/api/radio/listeners`.

### Storage

File-system browser under `/api/storage/*`. Supports listing, upload, download, mkdir, remove, read, write within `public/media/uploads/`.

## Download System (Lazy On-Demand Conversion)

Downloads are **no longer pre-generated** at build time. Only source WAV files exist on disk. When a user requests a download, `ffmpeg` transcodes on-the-fly with the exact options chosen, caches the result under `tracks/cache/<hash>/`, and serves it. Subsequent identical requests hit the cache.

### Available Formats

| Format | Container | Encoder | Bit Depth Support | Bitrate Control |
|---|---|---|---|---|
| `wav` | WAV | PCM | 8/16/24/32/64-bit | — |
| `flac` | FLAC | FLAC | 8/16/24/32-bit (s16/s32) | Compression level 5 |
| `ogg-opus` | OGG | libopus | — | VBR/CBR, 8–512 kbps |
| `ogg-vorbis` | OGG | libvorbis | — | VBR/CBR, 8–512 kbps |
| `aiff` | AIFF | PCM | 8/16/24/32/64-bit (big-endian) | — |
| `raw` | RAW | PCM | 8/16/24/32/64-bit (little-endian) | — |

### Options in the UI

- **Format**: WAV, FLAC, Opus, Vorbis, AIFF, RAW PCM
- **Sample Rate**: 8000–192000 Hz (limited by source), plus custom input
- **Channels**: Mono, Stereo, Quad, 8.0
- **Bit Depth**: 8/16/24/32/64-bit (PCM-based formats only)
- **Resampler**: None, Sinc (SoX), r8brain free
- **Bitrate**: VBR/CBR toggle + numeric input 8–512 kbps (lossy formats only)

### Cache

Converted files are cached at:
```
public/media/music/<Album>/tracks/cache/<hash>/
```
The hash is derived from all options (format, sample rate, bit depth, channels, resampler, bitrate mode, bitrate). If any option changes, a new conversion runs and a new cache entry is created. ZIP archives are assembled from cached files on the fly.

## Media Conversion Pipeline

All media processing lives in `server/lib/media-convert.ts`:

| Function | Tool | Purpose |
|---|---|---|
| `processGalleryImage` | `sharp` | Produce WebP (82), AVIF (65), 400px preview WebP |
| `processCoverImage` | `sharp` | Produce WebP (85), 400px preview WebP |
| `convertVideoToHls` | `ffmpeg` | 720p H.264 + AAC, segmented HLS, thumbnail |
| `convertAudioToHls` | `ffmpeg` | AAC 128k, segmented HLS |
| `convertAudioToFormat` | `ffmpeg` | Lazy on-demand format conversion with full options |
| `generateVideoThumbnail` | `ffmpeg` | 640px single-frame WebP |

Background rebuild (`spawnRebuild`) runs `vite build` after mutations so the client bundle reflects new content.

## File Layout

- source tracks live under `public/media/music/<release>/tracks/`
- generated previews live under `public/media/music/<release>/tracks/preview/`
- generated HLS segments live under `public/media/music/<release>/tracks/stream/`
- generated downloads are cached under `server/generated/` and `tmp/`
- app database lives at `server/generated/app.db` unless `DB_PATH` is set
- gallery entries under `public/media/gallery/<slug>/`
- video entries under `public/media/video/<slug>/`
- radio stream & schedule under `public/media/radio/`
- file storage under `public/media/uploads/`

## Deployment

The repo includes `webserver.nix` for a NixOS host.

It assumes:

- the checkout lives at `/var/www/d7tun6.site`
- that directory is writable by the `d7tun6` user
- the app listens on `127.0.0.1:3001`
- nginx terminates TLS and proxies to the Node server

Set `APP_ORIGIN` to the public origin, for example:

```bash
APP_ORIGIN=https://d7tun6.site
```
