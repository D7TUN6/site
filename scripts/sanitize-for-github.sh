#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  bash scripts/sanitize-for-github.sh [--dry-run|--apply]

Modes:
  --dry-run  Show what would be removed (default)
  --apply    Remove non-source/build/cache artifacts
EOF
}

mode="dry-run"
case "${1:-}" in
  ""|"--dry-run")
    mode="dry-run"
    ;;
  "--apply")
    mode="apply"
    ;;
  "-h"|"--help")
    usage
    exit 0
    ;;
  *)
    usage
    exit 1
    ;;
esac

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Only artifacts and machine-local junk. Keep source/content/media intact.
declare -a top_level_patterns=(
  "node_modules"
  "dist"
  "out"
  ".vite"
  ".cache"
  ".turbo"
  "coverage"
  ".nyc_output"
  ".eslintcache"
  ".stylelintcache"
  "tsconfig.tsbuildinfo"
  "vite.config.ts.timestamp-*"
  "npm-debug.log*"
  "yarn-debug.log*"
  "yarn-error.log*"
  "pnpm-debug.log*"
)

declare -a exact_paths=()
declare -A seen=()

add_path() {
  local value="$1"
  [[ -z "$value" ]] && return
  value="${value#./}"
  [[ -z "$value" ]] && return
  [[ "${seen[$value]+yes}" == "yes" ]] && return
  seen["$value"]=yes
  exact_paths+=("$value")
}

for pattern in "${top_level_patterns[@]}"; do
  while IFS= read -r path; do
    add_path "$path"
  done < <(find . -maxdepth 1 -mindepth 1 -name "$pattern" -print 2>/dev/null)
done

# Recursive OS/editor junk.
while IFS= read -r path; do
  add_path "$path"
done < <(find . -type f \( -name ".DS_Store" -o -name "Thumbs.db" -o -name "*.swp" -o -name "*.swo" -o -name "*~" \) -print 2>/dev/null)

if [[ "${#exact_paths[@]}" -eq 0 ]]; then
  echo "Nothing to sanitize."
  exit 0
fi

IFS=$'\n' sorted_paths=($(printf '%s\n' "${exact_paths[@]}" | sort -u))
unset IFS

echo "Sanitize mode: $mode"
echo "Will remove ${#sorted_paths[@]} path(s):"
for path in "${sorted_paths[@]}"; do
  echo "  - $path"
done

if [[ "$mode" != "apply" ]]; then
  echo
  echo "Dry-run complete. Re-run with --apply to delete."
  exit 0
fi

for path in "${sorted_paths[@]}"; do
  rm -rf -- "$path"
done

echo
echo "Sanitize complete."
