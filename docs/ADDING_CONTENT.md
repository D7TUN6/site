# Content Workflow

## Add a Base Page

Example: add `/en/projects` and `/ru/projects`.

1. Create:
   - `content/mdx/en/base/projects.mdx`
   - `content/mdx/ru/base/projects.mdx`
2. Update `src/types/content.ts`:
   - extend `BaseRoute`
   - extend navigation dictionary types if needed
3. Update `src/lib/content.ts`:
   - add the route to `baseRoutes`
   - add both language imports to `baseContentModuleMap`
4. Update labels in:
   - `public/locales/en.xml`
   - `public/locales/ru.xml`
5. Update nav items in `src/components/SiteFrame.vue`

Validate:

```bash
npm run typecheck
npm run build
```

## Add or Update a Release

Release pages are generated from `public/media/music/<Album Name>`.

Recommended layout:

```text
public/media/music/<Album Name>/
  cover/
    cover.jpg                # optional if artwork is embedded in first track
  notes/
    notes
  tracks/
    wav/                     # optional source folder
      01 - Track Name.wav
  links.json                 # optional platform links
```

### `notes`

Use a plain text file. If it contains a line like `released 07.03.26`, the generator uses it as the release date.

### `links.json`

Example:

```json
{
  "release": {
    "bandcamp": "https://d7tun6.bandcamp.com"
  },
  "tracks": {
    "01 - Track Name.wav": {
      "spotify": "https://open.spotify.com/...",
      "yandexMusic": "https://music.yandex.ru/...",
      "bandcamp": "https://bandcamp.com/...",
      "soundcloud": "https://soundcloud.com/..."
    }
  }
}
```

Track keys can match:

- the original filename
- the normalized track title
- the generated safe stem

## Rebuild Media + Manifests

```bash
npm run prepare:media
```

This regenerates:

- extracted covers and cover previews
- preview audio
- HLS stream output
- frontend release manifest
- backend download manifest

## Final Check

```bash
npm run typecheck
npm run build
```
