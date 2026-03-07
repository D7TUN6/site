# d7tun6.site

![D7TUN6 avatar](.github/assets/dvigoon-avatar.jpg)

Personal website for D7TUN6: music, notes, release pages, streaming links, fullscreen player, and downloadable release archives.

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
- automatic cover extraction from embedded track artwork when no cover file exists

## Quick Start

Requirements:

- Node.js 24+
- npm 10+
- `ffmpeg` and `ffprobe` in `PATH`

Install and run development:

```bash
npm install
npm run dev
```

Open:

- web: `http://127.0.0.1:3001`
- api in dev: `http://127.0.0.1:3002`

## Production

```bash
npm install
npm run build
npm run start
```

The production server serves the built SPA from `dist/` and the release download API from `/api/releases/download`.

## Main Scripts

- `npm run prepare:media` rebuild cover previews, HLS streams, previews, and release manifests
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
  notes/
    notes
  tracks/
    wav/        # optional
    preview/    # generated
    stream/     # generated HLS output
  playlists/    # generated
  links.json    # optional release + track platform links
```

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
