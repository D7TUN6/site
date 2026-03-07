# Migration Notes

Short version:

1. static HTML
2. Next.js
3. current stack: Vite + Vue + Express

## Why The Current Stack Stayed

- simple deployment
- direct control over media generation
- no SSR runtime overhead
- easy filesystem-driven release publishing

## Current Direction

The site now treats music releases as generated content:

- source files live in `public/media/music`
- `prepare:media` turns them into covers, previews, HLS streams, and manifests
- the frontend reads generated manifests instead of hardcoded release pages

That keeps authoring simple and makes the player/download pipeline deterministic.
