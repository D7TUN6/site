<div align="center">
  <img src=".github/assets/d7tun6-avatar.jpg" alt="D7TUN6 avatar" width="120" />
  <h1>d7tun6.site</h1>
  <p>Personal artist website for D7TUN6.</p>
  <p>Music, notes, release pages, blog posts, streaming links, shop, auth, and a fullscreen player.</p>
</div>

## stack

- **frontend**: SolidJS + Vite 8 + Tailwind CSS 4
- **server**: Bun + Elysia monolith (server/)
- **storage**: local filesystem (`public/media/`) on self-hosted SSD
- **cache/queue**: Redis (Upstash or local) - Redis Streams for background jobs
- **background worker**: Bun + ffmpeg (HLS transcoding, local filesystem)
- **radio**: Icecast + Liquidsoap (NixOS or manual)
- **admin panel**: SolidJS SPA (packages/admin)

## architecture

```
┌──────────────────────────────────────────────────┐
│  local SSD (public/media/)                       │
│  Redis (kv + queue streams)                      │
└────────┬────────────────────────────┬────────────┘
         │                            │
  ┌──────▼──────┐            ┌────────▼────────┐
  │  web app    │            │  background     │
  │  (Elysia)   │            │  worker         │
  │  port 3001  │◄────jobs───│  (ffmpeg+hls)   │
  │  + vite     │            │                 │
  └──────┬──────┘            └─────────────────┘
         │
  ┌──────▼──────┐
  │  radio      │
  │  icecast    │
  │  liquidsoap │
  └─────────────┘
```

## what it does

- localized site under `/en` and `/ru`
- music release pages from `public/media/music`
- HLS audio streaming with segmented playback
- fullscreen now-playing player
- release zip/track downloads with on-demand ffmpeg conversion (6 formats, sample rate, bit depth, channels, resampler, bitrate controls)
- blog index + per-post routes
- shop: product pages, cart, checkout + YooKassa widget payments
- email/password auth
- user account page with order history
- gallery with tag filtering, lightbox, and per-entry pages
- video catalogue with HLS streaming
- 24/7 internet radio (Icecast + Liquidsoap)
- admin panel for managing all content

## quick start (local development)

### prerequisites

- nix-shell (recommended) or Bun + Node.js + ffmpeg

### setup

```bash
# enter dev shell (all deps available)
nix-shell

# install dependencies
npm install

# copy and configure env
cp .env.example .env
# edit .env with your redis url, admin credentials, etc.

# start development server (vite + api)
npm run dev
```

open `http://127.0.0.1:5173`

### run tests

```bash
npm run test        # vitest
npm run typecheck   # typescript checks
```

### build

```bash
npm run build       # full production build (frontend + server)
```

### background worker

```bash
# start the background ffmpeg worker
cd worker && npm install && npm start
```

### admin panel

```bash
cd packages/admin && npm install && npm run dev
# opens on http://127.0.0.1:5174
```

## environment variables

see `.env.example` for the full list.

| var | required | description |
|-----|----------|-------------|
| `REDIS_URL` | yes | Redis connection string (for worker) |
| `JWT_SECRET` | yes | JWT signing secret for admin auth |
| `APP_SECRET` | yes | Session encryption secret |
| `ADMIN_EMAIL` | yes | Admin login email |
| `ADMIN_PASSWORD` | yes | Admin login password |
| `APP_ORIGIN` | yes | Site origin URL (e.g. `https://d7tun6.site`) |

## key scripts

| script | description |
|--------|-------------|
| `bun run dev` | Vite dev server + API |
| `bun run build` | Full production build |
| `bun run start` | Build + start production server |
| `bun run test` | Vitest |
| `bun run typecheck` | TypeScript checks |
| `bun run generate:releases` | Regenerate release manifest from `public/media/music/` |
| `bun run generate:shop` | Regenerate shop manifest from `public/media/shop/` |

## deployment

### option a: single-machine nixos (recommended)

```bash
# copy the module to your nixos config
cp site.nix /etc/nixos/
cp radio/nixos-module.nix /etc/nixos/

# add to your configuration.nix:
#   imports = [ ./site.nix ];
#   services.d7tun6.enable = true;
#   # configure all options...

# apply
nixos-rebuild switch
```

the module sets up:
- Redis (local, port 6379)
- Web app (Elysia on port 3001)
- Background worker (ffmpeg, HLS, zip)
- Icecast + Liquidsoap radio (port 8000)
- Caddy reverse proxy with optional ACME/TLS
- Hourly rebuild timer

### option b: manual deployment

```bash
# 1. install dependencies
npm install

# 2. configure environment
cp .env.example .env
# edit .env

# 3. build
npm run build

# 4. start the server
bun server/index.ts

# 5. start the worker (separate process)
cd worker && npm start

# 6. set up radio (icecast + liquidsoap)
cd radio && # follow radio/README
```

## project structure

```
├── packages/admin/    # admin SPA (SolidJS, Vite)
├── radio/
│   ├── icecast.xml    # Icecast stream server config
│   ├── liquidsoap.liq # Liquidsoap broadcast script
│   └── nixos-module.nix
├── scripts/
│   ├── generate-releases.ts  # scan public/media/music/ → manifest
│   └── generate-shop.ts      # scan public/media/shop/ → manifest
├── server/
│   ├── index.ts       # Bun entry point
│   ├── app.ts         # Elysia app
│   ├── lib/           # Server libs (db, media-convert, etc.)
│   └── routes/        # Elysia route handlers
├── src/
│   ├── lib/           # Frontend libs (i18n, player, etc.)
│   ├── components/    # SolidJS components
│   └── __tests__/     # Frontend unit tests
├── worker/
│   ├── index.ts       # Background worker (Redis Streams → ffmpeg)
│   └── package.json
├── site.nix            # Single-machine NixOS deployment (hardened, rootless)
├── shell.nix          # Nix dev shell
└── .env.example       # Environment variable template
```

## content modules

### releases

releases live under `public/media/music/<AlbumName>/`:
- `cover/cover.jpg` - album artwork
- `cover/cover-preview.webp` - small preview
- `tracks/*.wav` - source audio files
- `notes/notes` - release notes
- `.links` - streaming platform links
- `.release-date` - release date (DD/MM/YYYY or YYYY-MM-DD)
- `.release-type` - LP, EP, single, remaster
- `.release-hidden` - hide from listings

### gallery

entries at `public/media/gallery/<slug>/index.mdx`:
```yaml
---
title: "entry title"
date: "2025-01-01"
tags: [concert, live]
cover: cover.jpg
images: [img1.jpg, img2.jpg]
---
```

### video

entries at `public/media/video/<slug>/index.mdx`:
```yaml
---
title: "video title"
date: "2025-01-01"
duration: 120
thumbnail: thumb.webp
description: "video description"
sources:
  - url: /media/video/example/hls/index.m3u8
    type: application/vnd.apple.mpegurl
---
```

## download system

on-demand ffmpeg transcoding with cache:
- formats: wav, flac, ogg-opus, ogg-vorbis, aiff, raw
- options: sample rate (8k-192k), bit depth (8/16/24/32/64), channels, resampler, bitrate
- cache: content-addressed by option hash
- zip: assembled from cached files on request

## license

all rights reserved
