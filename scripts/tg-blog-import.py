#!/usr/bin/env python3
"""
tg-blog-import.py — Telegram channel export -> /blog MDX posts.

Reads a Telegram Desktop export (result.json) from EXPORT_DIR, filters out
garbage/privacy-sensitive content, copies attached media into
public/media/blog/ and writes one .mdx post per kept message into
content/mdx/{ru,en}/blog/.

Shared helpers live in blog_common.py (also used by the live bot).

Usage:
  python3 scripts/tg-blog-import.py --dry-run   # preview stats only
  python3 scripts/tg-blog-import.py             # full import
"""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import sys
from collections import Counter
from pathlib import Path

import blog_common as bc

ROOT = Path(__file__).resolve().parent.parent
EXPORT_DIR = Path(os.environ.get("TG_EXPORT_DIR", "/home/d7tun6/files/mounts/TS480SSD/ayu"))
RESULT_JSON = EXPORT_DIR / "result.json"


# ── media handling (export-specific) ─────────────────────────────
copied_set: set[str] = set()


def copy_media(relpath: str, unix: int, fallback: str) -> str | None:
    src = EXPORT_DIR / relpath
    if not src.exists():
        src = EXPORT_DIR / fallback
    if not src.exists():
        return None
    if relpath not in copied_set:
        copied_set.add(relpath)
    base = src.stem.strip() or "file"
    return bc.commit_media(src, unix, base)


def render_media(m: dict, unix: int, photos_only: bool = False) -> list[str]:
    out: list[str] = []
    if "photo" in m:
        url = copy_media(m["photo"], unix, "photos/photo.jpg")
        if url:
            out.extend(bc.media_block("photo", url, "фото из канала"))
        return out
    if photos_only or "file" not in m:
        return out

    relpath = m["file"]
    ext = Path(relpath).suffix.lower()
    fname = m.get("file_name") or Path(relpath).name
    mime = (m.get("mime_type") or "").lower()
    media_type = m.get("media_type", "")

    is_img = media_type == "sticker" or ext in bc.IMAGE_EXTS or mime.startswith("image/")
    is_audio = ext in bc.AUDIO_EXTS or mime.startswith(("audio/", "application/ogg", "application/x-ogg"))
    is_video = ext in bc.VIDEO_EXTS or mime.startswith("video/")

    if is_img:
        url = copy_media(relpath, unix, "images/x.webp")
        if url:
            out.extend(bc.media_block("photo", url, fname))
    elif is_audio:
        url = copy_media(relpath, unix, "files/audio.bin")
        if url:
            out.extend(bc.media_block("audio", url, fname))
    elif is_video:
        url = copy_media(relpath, unix, "video_files/video.mp4")
        if url:
            poster = None
            thumb = m.get("thumbnail")
            if thumb:
                poster = copy_media(thumb, unix, "video_files/thumb.jpg")
            out.extend(bc.media_block("video", url, fname, poster))
    else:
        url = copy_media(relpath, unix, "files/file.bin")
        if url:
            out.extend(bc.media_block("file", url, fname))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not RESULT_JSON.exists():
        print(f"ERROR: {RESULT_JSON} not found", file=sys.stderr)
        return 1

    data = json.loads(RESULT_JSON.read_text(encoding="utf-8"))
    msgs = data["messages"]
    total = len(msgs)
    bc.BLOG_RU.mkdir(parents=True, exist_ok=True)
    bc.BLOG_EN.mkdir(parents=True, exist_ok=True)
    bc.MEDIA_OUT.mkdir(parents=True, exist_ok=True)

    skipped = Counter()
    created: list[str] = []
    used_slugs: set[str] = set()

    for m in msgs:
        date = str(m.get("date", ""))[:19]
        unix = int(m.get("date_unixtime") or 0) or 86400

        if m.get("type") != "message":
            skipped["service"] += 1
            continue

        ents = m.get("text_entities") or []
        plain = "".join(e.get("text", "") for e in ents if isinstance(e, dict)).strip()
        has_photo = "photo" in m
        has_file = "file" in m
        media = has_photo or has_file
        forwarded = "forwarded_from" in m
        strip_links = re.sub(r"https?://\S+|www\.\S+", "", plain).strip()

        # ── filtering ──
        if forwarded and len(plain) < 40:
            skipped["репост без своего текста"] += 1
            continue
        if media and len(plain) < 8 and strip_links == "":
            skipped["медиа без текста/контекста"] += 1
            continue
        if strip_links == "" and re.search(r"https?://\S+", plain) and len(plain) < 60:
            skipped["изолированная ссылка"] += 1
            continue
        if not media and not plain:
            skipped["пустое сообщение"] += 1
            continue
        if not media and len(plain) < 50:
            skipped["короткий флуд (<50 без медиа)"] += 1
            continue

        paras = bc.build_paragraphs(ents if isinstance(ents, list) else [])
        if not paras and not has_photo and not has_file:
            skipped["нет контента для блога"] += 1
            continue

        # album announcement -> site link instead of attached tracks
        album = bc.album_match(plain)
        attachments: list[str] = []
        if album and has_file:
            attachments = render_media(m, unix, photos_only=True)
        else:
            attachments = render_media(m, unix)

        title_line = bc.first_line_plain(paras) or "Пост"
        title = re.sub(r"\s+", " ", title_line)[:64].strip().strip(".,;:! _-")
        if not title:
            title = "пост"
        slug_base = bc.slugify_ru(title) or "post"
        slug = f"{date[:10]}-{slug_base[:48]}"
        slug = re.sub(r"-+", "-", slug).strip("-")[:64]
        if not slug:
            slug = f"{date[:10]}-post"
        if slug in used_slugs:
            n = 2
            while f"{slug}-{n}" in used_slugs:
                n += 1
            slug = f"{slug}-{n}"
        used_slugs.add(slug)

        excerpt = html.unescape(re.sub(r"\s+", " ", title_line))[:140]
        tags = bc.classify(plain)
        content = bc.make_content(paras, attachments, album, [], slug, title, date, tags, excerpt)
        created.append(slug)

        if not args.dry_run:
            bc.write_post(slug, content)

    print("=" * 56)
    print(f"всего распарсено сообщений: {total}")
    print(f"отфильтровано и пропущено: {sum(skipped.values())}")
    for k, v in skipped.most_common():
        print(f"    - {k}: {v}")
    print(f"создано постов в /blog: {len(created)}")
    print(f"скопировано медиафайлов: {len(copied_set)}")
    if args.dry_run:
        print("(dry run — ничего не записано)")
    return 0


if __name__ == "__main__":
    sys.exit(main())