<div align="center">
  <img src=".github/assets/d7tun6-avatar.png" alt="D7TUN6 avatar" width="120" />

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
- `ffmpeg` / `ffprobe`
- filesystem-generated release manifests

## What It Does

- localized site under `/en` and `/ru`
- music release pages generated from `public/media/music`
- HLS audio streaming with segmented playback
- fullscreen now-playing player
- release ZIP and track downloads
- blog index + per-post routes
- shop: product pages, cart, checkout + YooKassa widget payments
- email/password auth
- user account page with order history
- admin panel for managing orders

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
- `npm run build` create production bundle
- `npm run start` run production server
- `npm run start:api` run API only
- `npm run generate:releases` rebuild release manifests
- `npm run generate:shop` rebuild shop data
- `npm run lint` run ESLint
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

## File Storage

- source tracks live under `public/media/music/<release>/tracks/`
- generated previews live under `public/media/music/<release>/tracks/preview/`
- generated HLS segments live under `public/media/music/<release>/tracks/stream/`
- generated downloads are cached under `server/generated/` and `tmp/`
- app database lives at `server/generated/app.db` unless `DB_PATH` is set

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

