# Contributing

## Prerequisites

- Node.js 22+
- npm 10+
- `ffmpeg`

## Setup

```bash
npm install
npm run generate:releases
npm run dev
```

## Branch and Commit Guidelines

- keep commits focused and small
- avoid unrelated file churn
- regenerate release artifacts when release assets or generator logic changes

## Required Checks

Run before PR:

```bash
npm run lint
npm run typecheck
npm run build
```

## Coding Standards

- strict TypeScript
- clear naming over excessive comments
- avoid dead code and stale flags
- keep API validation strict

## Security Expectations

- validate all API input parameters
- keep format allowlists explicit
- do not introduce shell interpolation with user input
- keep dependencies patched and run audit after updates

```bash
npm audit --omit=optional
```

## Performance Expectations

- keep initial bundle size controlled
- avoid unnecessary client re-renders
- keep conversion-heavy work server-side

## Content Changes

For new sections/releases, follow:

- `docs/ADDING_CONTENT.md`

## Review Checklist

- routes resolve correctly for both languages
- release generator output is deterministic
- queue-based download API works for all formats
- no lint/type/build regressions
