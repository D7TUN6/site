#!/usr/bin/env bash
# generates m3u8 playlist from local manifest for liquidsoap
set -euo pipefail

SERVER_URL="${SERVER_URL:-http://127.0.0.1:3001}"

TMP=$(mktemp -d)
trap "rm -rf $TMP" EXIT

# fetch manifest from local server
curl --retry 3 --retry-delay 5 -s \
  -o "$TMP/manifest.json" \
  "${SERVER_URL}/api/releases/manifest"

# generate playlist (titled EXTINF → liquidsoap→icecast icy metadata)
# so the real on-air "Artist - Title" can be matched against the server catalog.
cat > "$TMP/playlist.m3u8" << 'M3U'
#EXTM3U
M3U

jq -r '.releases[] | select(.tracks != null) | .artist as $artist | .tracks[] | select(.sourceUrl != null) | [((($artist // "D7TUN6") + " - " + (.title // "untitled"))), ((.duration // 0) * 1000), .sourceUrl] | @tsv' "$TMP/manifest.json" | \
  while IFS=$'\t' read -r title durMs url; do
    # EXTINF takes milliseconds for integer durations
    echo "#EXTINF:${durMs},${title}" >> "$TMP/playlist.m3u8"
    echo "${SERVER_URL}${url}" >> "$TMP/playlist.m3u8"
  done

# copy playlist to radio dir
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cp "$TMP/playlist.m3u8" "${SCRIPT_DIR}/../public/media/radio/playlist.m3u8"

echo "playlist generated with $(wc -l < "$TMP/playlist.m3u8") entries"
