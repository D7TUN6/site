# Migration Notes

Short version:

1. static HTML
2. Next.js
3. current stack: Vite + Vue + Express

## Why The Current Stack Stayed

- simple deployment
- direct control over media generation
- no SSR runtime overhead
- easy generated-content publishing with object storage for heavy media

## Current Direction

The site now treats music releases as generated content:

- source files live in `public/media/music`
- `prepare:media` turns them into covers, previews, HLS streams, and manifests
- the frontend reads generated manifests instead of hardcoded release pages

That keeps authoring simple and makes the player/download pipeline deterministic.

Heavy download artifacts are cached in MinIO so the site can regenerate them lazily if a ZIP is missing.

Track-format downloads use the same lazy cache path now: the site converts them only when requested, uploads the result to MinIO, and removes the temporary build file afterwards.
