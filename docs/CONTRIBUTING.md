# Working On The Project

## Local Setup

Requirements:

- Node.js 24+
- npm 10+
- `ffmpeg` and `ffprobe`

Run:

```bash
npm install
npm run dev
```

## Before Shipping Changes

Run:

```bash
npm run lint
npm run typecheck
npm run build
```

## Editing Rules

- keep changes focused
- do not hand-edit generated manifests unless debugging locally
- if you touch release assets or generator logic, run `npm run prepare:media`
- preserve bilingual routing under `/en` and `/ru`

## When Touching Audio / Releases

Check:

- HLS output still builds
- covers still resolve
- track links still appear only when provided
- fullscreen player still works from the bottom bar

For release structure, use [Content Workflow](ADDING_CONTENT.md).
