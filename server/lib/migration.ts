import type { DatabaseSync } from './sqlite.js'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

const root = process.cwd()
import { syncManifestToDb } from './manifest-sync.js'
const gallerydir = path.join(root, 'public', 'media', 'gallery')
const videodir = path.join(root, 'public', 'media', 'video')
const shopdir = path.join(root, 'public', 'media', 'shop')
const manifestpath = path.join(root, 'src', 'generated', 'release-manifest.json')

function ismigrationrun(db: DatabaseSync, key: string): boolean {
  const row = db.prepare("select value from site_config where key = ?").get(key) as { value: string } | undefined
  return !!row
}

function markmigrationdone(db: DatabaseSync, key: string) {
  db.prepare("insert or replace into site_config (key, value) values (?, '1')").run(key)
}

function parsefrontmatter(raw: string): Record<string, unknown> {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/)
  if (!match) return {}
  const body = match[1]
  const attrs: Record<string, unknown> = {}
  for (const line of body.split('\n')) {
    const sep = line.indexOf(':')
    if (sep === -1) continue
    const key = line.slice(0, sep).trim()
    const rawval = line.slice(sep + 1).trim()
    let val: unknown = rawval.replace(/^["']|["']$/g, '')
    if (rawval === 'true') val = true
    else if (rawval === 'false') val = false
    else if (/^\d+$/.test(rawval)) val = Number(rawval)
    else if (rawval.startsWith('[') && rawval.endsWith(']')) {
      val = rawval.slice(1, -1).split(',').map((s: string) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
    }
    attrs[key] = val
  }
  return attrs
}

export async function runmigration(db: DatabaseSync) {
  const now = Date.now()

  // — migration 001: populate content tables from filesystem —
  if (!ismigrationrun(db, 'migration_001')) {
    let artistid: number
    const existing = db.prepare("select id from artists where slug = 'd7tun6'").get() as { id: number } | undefined
    if (existing) {
      artistid = existing.id
    } else {
      const result = db.prepare("insert into artists (user_id, name, slug, bio, avatar_url, status, feedback_message, created_at) values (null, 'D7TUN6', 'd7tun6', '', '', 'approved', '', ?)").run(now)
      artistid = Number(result.lastInsertRowid)
    }

    try {
      const raw = await readFile(manifestpath, 'utf-8')
      const manifest = JSON.parse(raw)
      const rels = Array.isArray(manifest) ? manifest : (manifest.releases || [])
      for (const rel of rels) {
        const slug = rel.slug || ''
        if (!slug) continue
        const existingrel = db.prepare("select id from releases where slug = ?").get(slug) as { id: number } | undefined
        if (existingrel) continue
        const r = db.prepare(
          "insert into releases (artist_id, slug, album_name, release_date, release_type, hidden, genre_en, genre_ru, notes, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(
          artistid, slug, rel.albumName || '', rel.releaseDate || '', rel.releaseType || '',
          rel.hidden ? 1 : 0, rel.genre?.en || '', rel.genre?.ru || '', rel.notes || '', now, now
        )
        const releaseid = Number(r.lastInsertRowid)
        if (Array.isArray(rel.tracks)) {
          for (const track of rel.tracks) {
            const ti = typeof track.index === 'number' ? track.index : 0
            db.prepare(
              "insert into tracks (artist_id, release_id, track_index, title, duration, stream_url, preview_url, source_url, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)"
            ).run(
              artistid, releaseid, ti, track.title || '',
              typeof track.duration === 'number' ? track.duration : null,
              track.streamUrl || track.url || '', track.previewUrl || null, track.sourceUrl || null, now
            )
          }
        }
      }
    } catch (err) {
      console.error('migration 001: failed to import releases', err)
    }

    try {
      let dirs: import('node:fs').Dirent[]
      try { dirs = await readdir(gallerydir, { withFileTypes: true }) } catch (err) { console.error('migration readdir gallery failed', err); dirs = [] }
      for (const dirent of dirs) {
        if (!dirent.isDirectory()) continue
        const slug = dirent.name
        if (db.prepare("select id from photos where slug = ?").get(slug)) continue
        const mdxpath = path.join(gallerydir, slug, 'index.mdx')
        try {
          const raw = await readFile(mdxpath, 'utf-8')
          const a = parsefrontmatter(raw)
          db.prepare(
            "insert into photos (artist_id, slug, title, date, tags, cover, images, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)"
          ).run(
            artistid, slug, String(a.title ?? slug), String(a.date ?? ''),
            JSON.stringify(Array.isArray(a.tags) ? a.tags : []),
            String(a.cover ?? ''), JSON.stringify(Array.isArray(a.images) ? a.images : []), now, now
          )
        } catch (err) { console.error('migration gallery dir failed', err) }
      }
    } catch (err) {
      console.error('migration 001: failed to import gallery', err)
    }

    try {
      let dirs: import('node:fs').Dirent[]
      try { dirs = await readdir(videodir, { withFileTypes: true }) } catch (err) { console.error('migration readdir video failed', err); dirs = [] }
      for (const dirent of dirs) {
        if (!dirent.isDirectory()) continue
        const slug = dirent.name
        if (db.prepare("select id from videos where slug = ?").get(slug)) continue
        const mdxpath = path.join(videodir, slug, 'index.mdx')
        try {
          const raw = await readFile(mdxpath, 'utf-8')
          const a = parsefrontmatter(raw)
          const body = raw.replace(/^---[\s\S]*?---\n?/, '').trim()
          db.prepare(
            "insert into videos (artist_id, slug, title, date, duration, thumbnail, description, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)"
          ).run(
            artistid, slug, String(a.title ?? slug), String(a.date ?? ''),
            typeof a.duration === 'number' ? a.duration : null,
            String(a.thumbnail ?? ''), String(a.description || body || ''), now, now
          )
        } catch (err) { console.error('migration video dir failed', err) }
      }
    } catch (err) {
      console.error('migration 001: failed to import videos', err)
    }

    try {
      let dirs: import('node:fs').Dirent[]
      try { dirs = await readdir(shopdir, { withFileTypes: true }) } catch (err) { console.error('migration readdir shop failed', err); dirs = [] }
      for (const dirent of dirs) {
        if (!dirent.isDirectory()) continue
        const slug = dirent.name
        if (db.prepare("select id from products where slug = ?").get(slug)) continue
        const ppath = path.join(shopdir, slug, 'product.json')
        try {
          const data = JSON.parse(await readFile(ppath, 'utf-8'))
          const imgs = Array.isArray(data.images) ? data.images : []
          const cov = typeof data.coverImage === 'string' && data.coverImage ? data.coverImage : (imgs[0] || '')
          db.prepare(
            "insert into products (artist_id, slug, title, category, price, status, quantity, description_en, description_ru, images, cover_image, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
          ).run(
            artistid, slug, String(data.title || slug), String(data.category || ''),
            typeof data.price === 'number' ? Math.floor(data.price) : 0,
            String(data.status || 'available'),
            typeof data.quantity === 'number' && Number.isFinite(data.quantity) ? Math.max(0, Math.floor(data.quantity)) : 0,
            String(data.description?.en || ''), String(data.description?.ru || ''),
            JSON.stringify(imgs.map((f: string) => `/media/shop/${slug}/images/${f}`)),
            cov ? `/media/shop/${slug}/images/${cov}` : '', now, now
          )
        } catch (err) { console.error('migration shop product failed', err) }
      }
    } catch (err) {
      console.error('migration 001: failed to import shop products', err)
    }

    markmigrationdone(db, 'migration_001')
    console.info('migration 001: default artist and content tables populated')
  }

  // — migration 002: link artist to actual user (d7tun6) —
  if (!ismigrationrun(db, 'migration_002')) {
    const adminemail = process.env.ADMIN_EMAIL || ''

    // find or create user for the artist
    let userid: number | null = null
    if (adminemail) {
      const existinguser = db.prepare("select id from users where email = ?").get(adminemail.trim().toLowerCase()) as { id: number } | undefined
      if (existinguser) {
        userid = existinguser.id
      } else {
        // create a user for the artist with a random password (artist logs in via reset or admin sets password)
        const salt = crypto.randomBytes(16)
        const randompass = crypto.randomBytes(32).toString('hex')
        const derived = crypto.scryptSync(randompass, salt, 64, { N: 16384, r: 8, p: 1 })
        const hash = `scrypt$16384$8$1$${salt.toString('hex')}$${derived.toString('hex')}`
        const created = Date.now()
        const result = db.prepare(
          "insert into users (email, password_hash, email_verified, role, created_at, updated_at) values (?, ?, 1, 'artist', ?, ?)"
        ).run(adminemail.trim().toLowerCase(), hash, created, created)
        userid = Number(result.lastInsertRowid)
        console.info('migration 002: created user for', adminemail)
      }
    }

    if (userid) {
      // link artist to user
      db.prepare("update artists set user_id = ? where slug = 'd7tun6'").run(userid)
      // also set role to artist on the user if not already
      db.prepare("update users set role = 'artist' where id = ? and role = 'user'").run(userid)
      console.info('migration 002: linked artist d7tun6 to user', userid)
    }

    markmigrationdone(db, 'migration_002')
    console.info('migration 002: artist-user linkage complete')
  }

  // — migration 003: add verified column to artists —
  if (!ismigrationrun(db, 'migration_003')) {
    db.exec("alter table artists add column verified integer not null default 0")
    db.prepare("update artists set verified = 1 where status = 'approved'").run()
    markmigrationdone(db, 'migration_003')
    console.info('migration 003: verified column added to artists')
  }

  // — migration 004: add loudness columns to tracks —
  if (!ismigrationrun(db, 'migration_004')) {
    const trackInfo = db.prepare("PRAGMA table_info('tracks')").all() as Array<{ name: string }>
    const trackCols = new Set(trackInfo.map((c) => c.name))
    if (!trackCols.has('track_loudness')) db.exec("ALTER TABLE tracks ADD COLUMN track_loudness REAL")
    if (!trackCols.has('album_loudness')) db.exec("ALTER TABLE tracks ADD COLUMN album_loudness REAL")
    markmigrationdone(db, 'migration_004')
    console.info('migration 004: loudness columns added to tracks')
  }

  // — migration 005: allow video likes (rebuild likes table if CHECK lacks 'video') —
  if (!ismigrationrun(db, 'migration_005')) {
    const likesTable = db.prepare("select sql from sqlite_master where type = 'table' and name = 'likes'").get() as { sql: string } | undefined
    if (!likesTable?.sql.includes("'video'")) {
      db.exec('PRAGMA foreign_keys = OFF')
      try {
        db.exec('BEGIN')
        db.exec('DROP INDEX IF EXISTS likes_target_slug_idx')
        db.exec('DROP INDEX IF EXISTS likes_user_id_idx')
        db.exec('DROP INDEX IF EXISTS likes_session_id_idx')
        db.exec(`
          CREATE TABLE likes_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            session_id TEXT,
            target_type TEXT NOT NULL CHECK(target_type IN ('album', 'track', 'video')),
            target_slug TEXT NOT NULL,
            track_index INTEGER,
            created_at INTEGER NOT NULL
          )
        `)
        db.exec(`
          INSERT INTO likes_new (id, user_id, session_id, target_type, target_slug, track_index, created_at)
          SELECT id, user_id, session_id, target_type, target_slug, track_index, created_at FROM likes
        `)
        db.exec('DROP TABLE likes')
        db.exec('ALTER TABLE likes_new RENAME TO likes')
        db.exec('CREATE INDEX likes_target_slug_idx ON likes(target_slug)')
        db.exec('CREATE INDEX likes_user_id_idx ON likes(user_id)')
        db.exec('CREATE INDEX likes_session_id_idx ON likes(session_id)')
        db.exec('COMMIT')
        console.info('migration 005: likes CHECK updated to allow video likes')
      } catch (err) {
        db.exec('ROLLBACK')
        throw err
      } finally {
        db.exec('PRAGMA foreign_keys = ON')
      }
    } else {
      console.info('migration 005: likes table already allows video likes')
    }
    markmigrationdone(db, 'migration_005')
  }

  // — manifest sync: ensure all manifest releases exist in DB (runs every startup) —
  const inserted = await syncManifestToDb(db)
    if (inserted > 0) {
      console.info(`manifest sync: inserted ${inserted} missing releases`)
  }
}
