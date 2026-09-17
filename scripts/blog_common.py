#!/usr/bin/env python3
"""blog_common.py — shared helpers for the blog pipeline.

Used by both the batch importer (scripts/tg-blog-import.py) and the live bot
(services/blogbot/blogbot.py). Single source of truth for text transformation,
privacy scrubbing, media block rendering and frontmatter assembly.

Usage (from sibling scripts):
    import blog_common as bc
"""

from __future__ import annotations

import html
import os
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BLOG_RU = ROOT / "content" / "mdx" / "ru" / "blog"
BLOG_EN = ROOT / "content" / "mdx" / "en" / "blog"
MEDIA_OUT = ROOT / "public" / "media" / "blog"
MEDIA_URL_PREFIX = "/media/blog/"

# ── privacy scrubbing ────────────────────────────────────────────
PRIVATE_KEY = re.compile(
    r"-----+\s*BEGIN [A-Z0-9 ]*PRIVATE KEY[\s\S]*?-----+\s*END [A-Z0-9 ]*PRIVATE KEY-----+"
)
PGP_BLOCK = re.compile(r"-----+\s*BEGIN PGP[\s\S]*?-----+\s*END PGP-----+", re.IGNORECASE)
IPV4 = re.compile(r"\b(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}\b")
HEXTOKEN = re.compile(r"\b[0-9a-fA-F]{40,}\b")
BASE64TOKEN = re.compile(r"\b[A-Za-z0-9+/]{48,}={0,2}\b")
EMAIL = re.compile(r"\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b")
PHONE = re.compile(r"(?<!\d)(?:\+7|8)[\s\-()]*\d{3}[\s\-)]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}(?!\d)")
LOCAL_HOST = re.compile(r"\b[\w-]+\.(?:local|lan|home)\b")
USERINFO = re.compile(r"://[^/@\s]+(:[^/@\s]*)?@")
CRED_KV = re.compile(
    r"\b(token|password|passwd|api[_-]?key|bot[_-]?token|access[_-]?key|secret[_-]?key|auth[_-]?key)"
    r"([=: ]+)([^\s&,;\"']+)",
    re.IGNORECASE,
)


def _cred_sub(m: re.Match) -> str:
    key_name, sep, val = m.group(1), m.group(2), m.group(3)
    looks_secret = any(c.isdigit() for c in val) or len(val) <= 4
    return (key_name + sep + "[redacted]") if looks_secret else m.group(0)


def scrub(text: str) -> str:
    t = PRIVATE_KEY.sub("[private key removed]", text)
    t = PGP_BLOCK.sub("[pgp block removed]", t)
    t = IPV4.sub("[ip-redacted]", t)
    t = HEXTOKEN.sub("[token]", t)
    t = BASE64TOKEN.sub("[token]", t)
    t = EMAIL.sub("[email]", t)
    t = PHONE.sub("[phone]", t)
    t = LOCAL_HOST.sub("[host-redacted]", t)
    t = USERINFO.sub("://[redacted]@", t)
    t = CRED_KV.sub(_cred_sub, t)
    return t


# ── transliteration for slugs ────────────────────────────────────
TRANSLIT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e",
    "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "kh", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
}


def slugify_ru(s: str) -> str:
    out = []
    for ch in s.lower().strip():
        if ch in TRANSLIT:
            out.append(TRANSLIT[ch])
        elif ch.isalnum() or ch in "-.":
            out.append(ch)
        else:
            out.append(" ")
    slug = re.sub(r"\s+", "-", "".join(out))
    slug = re.sub(r"-+", "-", slug).strip("-.")
    return slug[:70]


# ── telegram text -> html block lines ────────────────────────────
def esc(t: str) -> str:
    return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def attr_esc(t: str) -> str:
    return esc(t).replace('"', "&quot;")


ENTITY_WRAP = {
    "bold": ("<b>", "</b>"),
    "italic": ("<i>", "</i>"),
    "underline": ("<u>", "</u>"),
    "strikethrough": ("<s>", "</s>"),
    "code": ("<code>", "</code>"),
}


def link_href(ent: dict) -> str:
    if ent.get("href"):
        return ent["href"]
    txt = ent.get("text", "")
    return txt if re.match(r"^(?:https?|tg|t\.me|ftp):", txt) else ""


def build_paragraphs(text_entities: list) -> list[str]:
    """Return list of html block strings (each one will be emitted on its own line)."""
    paras: list[str] = []
    buf: list[str] = []

    def flush():
        cur = "".join(buf)
        if cur.strip():
            paras.append(f"<p>{cur}</p>")
        buf.clear()

    for ent in text_entities:
        if not isinstance(ent, dict):
            continue
        etype = ent.get("type", "plain")
        if etype == "pre":
            flush()
            code = esc(scrub(str(ent.get("text", ""))))
            paras.append(f"<pre><code>{code}</code></pre>")
            continue
        if etype == "blockquote":
            flush()
            quote = esc(scrub(str(ent.get("text", ""))))
            paras.append(f"<blockquote>{quote}</blockquote>")
            continue
        raw = str(ent.get("text", ""))
        txt = esc(scrub(raw))
        if not txt:
            continue
        href = link_href(ent) if etype in ("link", "text_link") else ""
        if etype in ("link", "text_link") and href:
            piece = f'<a href="{attr_esc(href)}">{txt}</a>'
        else:
            w = ENTITY_WRAP.get(etype, ("", ""))
            piece = f"{w[0]}{txt}{w[1]}" if w[0] else txt
        lines = piece.split("\n")
        for i, ln in enumerate(lines):
            if ln:
                buf.append(ln)
            if i < len(lines) - 1:
                flush()
    flush()
    return paras


# ── media handling ───────────────────────────────────────────────
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".bmp"}
AUDIO_EXTS = {".mp3", ".flac", ".ogg", ".wav", ".m4a", ".opus", ".aac", ".wma"}
VIDEO_EXTS = {".mp4", ".webm", ".mov", ".mkv", ".3gp", ".avi"}


def safe_name(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", name)


def commit_media(src: Path, unix: int, base: str) -> str | None:
    """Copy a local media file into public/media/blog/, dedup by destination.

    Returns the public URL (/media/blog/...) or None if the source is missing.
    """
    if not src or not src.exists():
        return None
    ext = src.suffix.lower()
    clean = safe_name(base.strip()) if base.strip() else "file"
    dest_name = f"{unix}_{clean}{ext}"
    dest = MEDIA_OUT / dest_name
    if not dest.exists():
        MEDIA_OUT.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)
    return MEDIA_URL_PREFIX + dest_name


def media_block(kind: str, url: str, fname: str = "", poster: str | None = None) -> list[str]:
    """HTML block line(s) for one piece of attached media."""
    name = fname or (url.rsplit("/", 1)[-1] if url else "")
    if kind == "photo":
        return [f'<img class="blog-media" src="{url}" alt="{attr_esc(name)}" />']
    if kind == "audio":
        return [
            f'<audio class="blog-media" controls preload="metadata" src="{url}"></audio>',
            f'<a class="blog-media-caption" href="{url}">♪ {esc(name)}</a>',
        ]
    if kind == "video":
        poster_attr = f' poster="{attr_esc(poster)}"' if poster else ""
        return [
            f'<video class="blog-media" controls preload="metadata" playsinline{poster_attr} src="{url}"></video>',
            f'<a class="blog-media-caption" href="{url}">🎬 {esc(name)}</a>',
        ]
    return [f'<a class="blog-media-caption" href="{url}">📎 {esc(name)}</a>']


def referenced_urls(blocks: list[str]) -> list[str]:
    urls = []
    for b in blocks:
        urls += re.findall(r"/(?:media/blog/)[\w./%+-]+", b)
    return list(dict.fromkeys(urls))


# ── classification ───────────────────────────────────────────────
ALBUMS = {
    "a-path-of-static-snow": ["a path of static snow", "static snow", "path of static"],
    "b-twin": ["b twin", "b-twin", "b twins"],
    "obskr3-e": ["obskr3", "obskr"],
    "psystar": ["psystar"],
    "wh1te-hous3": ["wh1te hous3", "wh1te-hous3", "white hous"],
}

TAG_KEYWORDS = {
    "music": [
        "renoise", "музык", "трек", "альбом", "релиз", "синтез", "семпл", "сэмпл",
        "мастеринг", "сведен", "sound design", "саунд", "дисторшн", "реверб",
        "эквалайзер", "midi", "мелоди", "аккорд", "барабан", "гитар", "электр",
        "vst", "плагин", "тональн", "bpm", "арпеджио", "mixing", "микс", "бит",
        "loop", "переиздан", "бутлег",
    ],
    "audio": [
        "flac", "ogg", "mp3", "wav", "audacity", "аудио", "кассет", "tape",
        "громкость", "петля", "дорожк", "студий", "микрофон", "вокал", "голос",
        "звук", "шумоподавл",
    ],
    "dev": [
        "nixos", "linux", "rust", "backend", "бэкенд", "api", "сервер", "деплой",
        "инфраструктур", "скрипт", "bash", "python", "docker", "контейнер", "vps",
        "git", "github", "код", "программир", "devlog", "compile", "neovim",
        "svelte", "solid", "frontend", "sql", "database", "ядро", "kernel",
    ],
    "nixos": ["nixos", "home-manager", "nixpkgs", "flake", "systemd", "пересобрал", "nix-shell"],
    "visual": [
        "фото", "снимок", "камер", "линз", "лиминальн", "vhs", "svhs", "hi8",
        "crt", "эфир", "static", "зерно", "экспозиц", "аналог", "пленк", "полароид",
        "polaroid", "эстетик", "концепт", "обложк", "cover", "скрин",
    ],
}

THOUGHT_KW = ["переосмысл", "наверное", "кажется", "почему", "думаю", "мысль", "размышл", "вспомнил"]


def classify(text_plain: str) -> list[str]:
    low = text_plain.lower()
    tags = [tag for tag, words in TAG_KEYWORDS.items() if any(w in low for w in words)]
    if len(text_plain.strip()) >= 250 or any(w in low for w in THOUGHT_KW):
        tags.append("thoughts")
    return sorted(set(tags)) or ["misc"]


def album_match(text_plain: str) -> str | None:
    low = text_plain.lower()
    for slug, names in ALBUMS.items():
        if any(n in low for n in names):
            return slug
    return None


# ── post assembly ────────────────────────────────────────────────
def first_line_plain(paras: list[str]) -> str:
    for p in paras:
        t = re.sub(r"<[^>]+>", "", p)
        t = html.unescape(t).strip()
        if t:
            return t
    return ""


def safe_fm_value(s: str) -> str:
    return s.replace('"', "'").strip()


def make_content(
    paras: list[str],
    attachments: list[str],
    album: str | None,
    media_urls: list[str],
    slug: str,
    title: str,
    date_iso: str,
    tags: list[str],
    excerpt: str,
) -> str:
    blocks = list(paras)
    if album:
        if attachments:
            blocks.append("")
            blocks.extend(attachments)
        blocks.append(f"[слушать альбом на сайте](/ru/music/{album})")
    elif attachments:
        blocks.append("")
        blocks.extend(attachments)

    url_list = media_urls or referenced_urls(blocks)
    fm = [
        "---",
        f'title: "{safe_fm_value(title)}"',
        f'date: "{date_iso}"',
        f"publishedAt: {date_iso}",
        f"slug: {slug}",
        f"tags: [{', '.join(tags)}]",
        f'excerpt: "{safe_fm_value(excerpt)}"',
    ]
    if url_list:
        fm.append(f"media: [{', '.join(url_list)}]")
    fm.append("---")
    fm.append("")

    body = "\n\n".join(b for b in blocks if b.strip())
    return "\n".join(fm) + "\n\n" + body + "\n"


def write_post(slug: str, content: str) -> None:
    BLOG_RU.mkdir(parents=True, exist_ok=True)
    BLOG_EN.mkdir(parents=True, exist_ok=True)
    BLOG_RU.joinpath(f"{slug}.mdx").write_text(content, encoding="utf-8")
    en_content = content.replace("](/ru/music/", "](/en/music/")
    BLOG_EN.joinpath(f"{slug}.mdx").write_text(en_content, encoding="utf-8")