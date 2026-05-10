# d7tun6.site

Personal site for D7TUN6.

## What it includes

- localized pages under `/en` and `/ru`
- release pages generated from `public/media/music`
- HLS audio streaming and a fullscreen player
- track and release ZIP downloads
- blog pages from local content files
- shop, cart, checkout, and YooKassa payments
- email/password auth
- user account page and order history
- admin panel for orders and test orders

## Requirements

- Node.js 24+
- npm 10+
- `ffmpeg` and `ffprobe` in `PATH`
- a writable working tree

## Environment

Copy `.env.example` to `.env` and fill in the values.

Required for the app to boot:

- `APP_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

Required for production deployment:

- `APP_ORIGIN`
- `DB_PATH`

Required for shipping and payments:

- `YANDEX_MAPS_SEARCH_API_KEY`
- `YOOKASSA_SHOP_ID`
- `YOOKASSA_SECRET_KEY`
- `YOOKASSA_RETURN_URL`

Optional:

- `PORT` default `3001`
- `HOSTNAME` default `127.0.0.1`
- `COOKIE_DOMAIN`
- `YANDEX_MAPS_JS_API_KEY` or `YANDEX_MAPS_API_KEY`

## Development

Install dependencies first:

```bash
npm install
```

Frontend only:

```bash
npm run dev
```

This starts Vite on `http://127.0.0.1:5173` and proxies `/api` to the backend.

Frontend + API together:

```bash
npm run dev:all
```

If you want the API separately:

```bash
npm run start:api
```

## Production

Build everything:

```bash
npm run build
```

Run the production server:

```bash
npm run start
```

The production server:

- builds release manifests and shop data
- serves the Vite bundle from `dist/`
- serves the API from `/api/*`
- serves static files from `public/`

## Deployment notes

The repository includes `webserver.nix` for a NixOS host.

It assumes:

- the checkout lives at `/var/www/d7tun6.site`
- that directory is writable by the `d7tun6` user
- the app listens on `127.0.0.1:3001`
- nginx terminates TLS and proxies to the Node server

If you deploy behind a reverse proxy, keep `APP_ORIGIN` set to the public origin, for example:

```bash
APP_ORIGIN=https://d7tun6.site
```

If cookies must work across subdomains, set `COOKIE_DOMAIN` explicitly.

## Main scripts

- `npm run dev` - Vite only
- `npm run dev:all` - API + Vite
- `npm run build` - production build
- `npm run start` - production server
- `npm run start:api` - API only
- `npm run generate:releases` - rebuild release manifests
- `npm run generate:shop` - rebuild shop data
- `npm run lint` - ESLint
- `npm run typecheck` - TypeScript check

## Data layout

- source audio: `public/media/music/<release>/tracks/*`
- generated previews: `public/media/music/<release>/tracks/preview/`
- generated HLS: `public/media/music/<release>/tracks/stream/`
- cached downloads: `server/generated/` and `tmp/` subdirectories
- app database: `server/generated/app.db` unless `DB_PATH` is set
