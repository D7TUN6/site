<div align="center">
  <img src=".github/assets/dvigoon-avatar.jpg" alt="D7TUN6 avatar" width="120" />

  <h1>d7tun6.site</h1>
  <p>Personal artist website for D7TUN6: music, notes, release pages, blog posts, streaming links, and a fullscreen player.</p>

  <p>
    <a href="https://open.spotify.com/artist/3kxsK6GeWVOpm90RqqfYZy">
      <img src="public/media/image/spotify-badge.png" alt="Spotify" height="44" />
    </a>
    <a href="https://music.yandex.ru/artist/25225583">
      <img src="public/media/image/yandex-badge.png" alt="Yandex Music" height="44" />
    </a>
    <a href="https://d7tun6.bandcamp.com">
      <img src="public/media/image/bandcamp-badge.png" alt="Bandcamp" height="44" />
    </a>
    <a href="https://soundcloud.com">
      <img src="public/media/image/soundcloud-badge.webp" alt="SoundCloud" height="42" />
    </a>
  </p>
</div>

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
