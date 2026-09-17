import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { DatabaseSync } from './sqlite.js'
import { runmigration } from './migration.js'

function defaultDbPath(rootDir: string) {
  return path.join(rootDir, 'server', 'generated', 'app.db')
}

export async function openAppDb({ rootDir }: { rootDir: string }) {
  const dbPath = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : defaultDbPath(rootDir)
  await mkdir(path.dirname(dbPath), { recursive: true })

  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec('PRAGMA synchronous = NORMAL;')
  db.exec('PRAGMA foreign_keys = ON;')
  db.exec('PRAGMA busy_timeout = 5000;')

  migrate(db)
  await runmigration(db).catch((err) => console.error('migration failed', err))
  return { db, dbPath }
}

function migrate(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      email_verified INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      ip TEXT,
      user_agent TEXT
    );

    CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS admin_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_hash TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      ip TEXT,
      user_agent TEXT
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      user_email TEXT NOT NULL,
      status TEXT NOT NULL,
      currency TEXT NOT NULL,
      items_total INTEGER NOT NULL,
      shipping_provider TEXT NOT NULL,
      pickup_point_json TEXT NOT NULL,
      customer_comment TEXT NOT NULL DEFAULT '',
      payment_provider TEXT,
      payment_id TEXT,
      payment_status TEXT,
      payment_amount INTEGER,
      paid_at INTEGER,
      shipping_eta TEXT,
      tracking_number TEXT,
      tracking_status TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS orders_user_id_idx ON orders(user_id);
    CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status);

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_slug TEXT NOT NULL,
      product_title TEXT NOT NULL,
      unit_price INTEGER NOT NULL,
      quantity INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items(order_id);

    CREATE TABLE IF NOT EXISTS order_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      message TEXT NOT NULL,
      data_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS order_events_order_id_idx ON order_events(order_id);

    CREATE TABLE IF NOT EXISTS site_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS banners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page TEXT NOT NULL,
      text TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)

  // Likes & plays tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      session_id TEXT,
      target_type TEXT NOT NULL CHECK(target_type IN ('album', 'track', 'video')),
      target_slug TEXT NOT NULL,
      track_index INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS likes_target_slug_idx ON likes(target_slug);
    CREATE INDEX IF NOT EXISTS likes_user_id_idx ON likes(user_id);
    CREATE INDEX IF NOT EXISTS likes_session_id_idx ON likes(session_id);

    CREATE TABLE IF NOT EXISTS plays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      release_slug TEXT NOT NULL,
      track_index INTEGER NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('skip', 'partial', 'full')),
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      session_id TEXT,
      ip TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS plays_release_slug_idx ON plays(release_slug);
    CREATE INDEX IF NOT EXISTS plays_created_at_idx ON plays(created_at);

    CREATE TABLE IF NOT EXISTS video_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_slug TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      session_id TEXT,
      ip TEXT,
      duration_watched REAL NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS video_views_video_slug_idx ON video_views(video_slug);
    CREATE INDEX IF NOT EXISTS video_views_created_at_idx ON video_views(created_at);
  `)

  // safe migration: add columns that may not exist yet
  const tableInfo = db.prepare("PRAGMA table_info('users')").all() as Array<{ name: string }>
  const columns = new Set(tableInfo.map((c) => c.name))
  if (!columns.has('banned')) db.exec("ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0")
  if (!columns.has('banned_at')) db.exec("ALTER TABLE users ADD COLUMN banned_at INTEGER")
  if (!columns.has('updated_at_real')) db.exec("ALTER TABLE users ADD COLUMN updated_at_real INTEGER")
  if (!columns.has('role')) db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'")

  // Multi-artist platform tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS artists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      bio TEXT NOT NULL DEFAULT '',
      avatar_url TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      verified INTEGER NOT NULL DEFAULT 0,
      feedback_message TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS artists_slug_idx ON artists(slug);
    CREATE INDEX IF NOT EXISTS artists_status_idx ON artists(status);

    CREATE TABLE IF NOT EXISTS releases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
      slug TEXT NOT NULL,
      album_name TEXT NOT NULL,
      release_date TEXT NOT NULL DEFAULT '',
      release_type TEXT NOT NULL DEFAULT '',
      hidden INTEGER NOT NULL DEFAULT 0,
      genre_en TEXT NOT NULL DEFAULT '',
      genre_ru TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS releases_artist_id_idx ON releases(artist_id);
    CREATE INDEX IF NOT EXISTS releases_slug_idx ON releases(slug);

    CREATE TABLE IF NOT EXISTS tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
      release_id INTEGER NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
      track_index INTEGER NOT NULL,
      title TEXT NOT NULL,
      duration REAL,
      stream_url TEXT NOT NULL DEFAULT '',
      preview_url TEXT,
      source_url TEXT,
      track_loudness REAL,
      album_loudness REAL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS tracks_artist_id_idx ON tracks(artist_id);
    CREATE INDEX IF NOT EXISTS tracks_release_id_idx ON tracks(release_id);

    CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      date TEXT NOT NULL DEFAULT '',
      duration REAL,
      thumbnail TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS videos_artist_id_idx ON videos(artist_id);
    CREATE INDEX IF NOT EXISTS videos_slug_idx ON videos(slug);

    CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      date TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '',
      cover TEXT NOT NULL DEFAULT '',
      images TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS photos_artist_id_idx ON photos(artist_id);
    CREATE INDEX IF NOT EXISTS photos_slug_idx ON photos(slug);

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '',
      price INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'RUB',
      status TEXT NOT NULL DEFAULT 'available',
      quantity INTEGER NOT NULL DEFAULT 0,
      description_en TEXT NOT NULL DEFAULT '',
      description_ru TEXT NOT NULL DEFAULT '',
      images TEXT NOT NULL DEFAULT '',
      cover_image TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS products_artist_id_idx ON products(artist_id);
    CREATE INDEX IF NOT EXISTS products_slug_idx ON products(slug);

    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      artist_id INTEGER REFERENCES artists(id) ON DELETE SET NULL,
      type TEXT NOT NULL CHECK(type IN ('artist_registration', 'release', 'media_photo', 'media_video', 'shop_product')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      data TEXT NOT NULL DEFAULT '{}',
      feedback TEXT NOT NULL DEFAULT '',
      scheduled_at INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS submissions_user_id_idx ON submissions(user_id);
    CREATE INDEX IF NOT EXISTS submissions_status_idx ON submissions(status);
    CREATE INDEX IF NOT EXISTS submissions_type_idx ON submissions(type);

    CREATE TABLE IF NOT EXISTS support_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'other',
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'resolved', 'closed')),
      admin_notes TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS support_tickets_user_id_idx ON support_tickets(user_id);
    CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON support_tickets(status);
  `)

  // Blog comments
  db.exec(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_slug TEXT NOT NULL,
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'deleted')),
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS comments_post_slug_idx ON comments(post_slug, status);
    CREATE INDEX IF NOT EXISTS comments_author_id_idx ON comments(author_id);
    CREATE INDEX IF NOT EXISTS comments_parent_id_idx ON comments(parent_id);
  `)
}
