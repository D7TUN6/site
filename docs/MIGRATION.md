# Migration Notes

This project has gone through two major migrations:

1. static HTML -> Next.js
2. Next.js -> Vite + React + Node API server

## Current Stack (Final)

- frontend: Vite + React + React Router + MDX
- backend: Node + Express (queue download API + static serving)
- content: MDX per language (`en`, `ru`)
- i18n dictionaries: XML in `public/locales`

## Why Next.js Was Replaced

- simplify runtime model for this project
- keep full control of API queue process and static serving
- reduce framework-specific coupling in content/rendering layer

## Stable Routing Model

- `/` redirects to `/en`
- localized routes are client-side under `/:lang/*`
- languages: `en`, `ru`

## Release Model

Release pages and API metadata are generated from `public/media/music` by:

- `scripts/generate-releases.mjs`

Generated outputs now target:

- `content/mdx/<lang>/releases/*.mdx`
- `src/lib/generated-release-routes.ts`
- `server/generated/release-download-data.json`

## Legacy Artifacts

Next.js runtime artifacts were removed from the repository during migration cleanup.
