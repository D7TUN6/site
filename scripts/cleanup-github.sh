#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

rm -rf node_modules dist tmp temp coverage .vite .cache .temp
rm -rf src/generated server/generated
rm -rf public/media/music

find . -maxdepth 1 -type f -name "*.log" -delete
find . -maxdepth 1 -type f -name "npm-debug.log*" -delete
find . -maxdepth 1 -type f -name "yarn-debug.log*" -delete
find . -maxdepth 1 -type f -name "yarn-error.log*" -delete
find . -maxdepth 1 -type f -name "pnpm-debug.log*" -delete
find . -maxdepth 1 -type f -name ".env" -delete
find . -maxdepth 1 -type f -name ".env.*" ! -name ".env.example" -delete
find . -type f -name "*.tsbuildinfo" -delete

find . -maxdepth 1 -type f -name "photo_*.jpg" -delete
find . -maxdepth 1 -type f -name "photo_*.jpeg" -delete
find . -maxdepth 1 -type f -name "photo_*.png" -delete

