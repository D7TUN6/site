import type { DatabaseSync } from './sqlite.js'

function approveArtistRegistration(db: DatabaseSync, payload: Record<string, unknown>) {
  const now = Date.now()
  const name = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : ''
  const slug = typeof payload.slug === 'string' && payload.slug.trim() ? payload.slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : ''
  if (!name || !slug) return { error: 'invalid artist data' }
  db.prepare("insert into artists (user_id, name, slug, bio, avatar_url, status, created_at) values (?, ?, ?, ?, ?, 'approved', ?)").run(
    (payload.userId as number) || null, name, slug, String(payload.bio || ''), String(payload.avatarUrl || ''), now
  )
  return { ok: true }
}

function approveRelease(db: DatabaseSync, submissionId: number, data: Record<string, unknown>) {
  const now = Date.now()
  const artistid = typeof data.artistid === 'number' ? data.artistid : null
  if (!artistid) return { error: 'no artistId' }
  const slug = String(data.slug || '')
  if (!slug) return { error: 'no slug' }
  db.prepare(
    "insert into releases (artist_id, slug, album_name, release_date, release_type, hidden, genre_en, genre_ru, notes, created_at, updated_at) values (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)"
  ).run(
    artistid, slug, String(data.albumname || slug), String(data.releasedate || ''),
    String(data.releasetype || ''), String(data.genreen || ''), String(data.genreru || ''),
    String(data.notes || ''), now, now
  )
  return { ok: true }
}

function approveMediaPhoto(db: DatabaseSync, submissionId: number, data: Record<string, unknown>) {
  const now = Date.now()
  const artistid = typeof data.artistid === 'number' ? data.artistid : null
  if (!artistid) return { error: 'no artistId' }
  const slug = String(data.slug || '')
  if (!slug) return { error: 'no slug' }
  db.prepare(
    "insert into photos (artist_id, slug, title, date, tags, cover, images, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    artistid, slug, String(data.title || slug), String(data.date || ''),
    JSON.stringify(Array.isArray(data.tags) ? data.tags : []),
    String(data.cover || ''), JSON.stringify(Array.isArray(data.images) ? data.images : []), now, now
  )
  return { ok: true }
}

function approveMediaVideo(db: DatabaseSync, submissionId: number, data: Record<string, unknown>) {
  const now = Date.now()
  const artistid = typeof data.artistid === 'number' ? data.artistid : null
  if (!artistid) return { error: 'no artistId' }
  const slug = String(data.slug || '')
  if (!slug) return { error: 'no slug' }
  db.prepare(
    "insert into videos (artist_id, slug, title, date, duration, thumbnail, description, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    artistid, slug, String(data.title || slug), String(data.date || ''),
    typeof data.duration === 'number' ? data.duration : null,
    String(data.thumbnail || ''), String(data.description || ''), now, now
  )
  return { ok: true }
}

function approveShopProduct(db: DatabaseSync, submissionId: number, data: Record<string, unknown>) {
  const now = Date.now()
  const artistid = typeof data.artistid === 'number' ? data.artistid : null
  if (!artistid) return { error: 'no artistId' }
  const slug = String(data.slug || '')
  if (!slug) return { error: 'no slug' }
  db.prepare(
    "insert into products (artist_id, slug, title, category, price, status, quantity, description_en, description_ru, images, cover_image, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    artistid, slug, String(data.title || slug), String(data.category || ''),
    typeof data.price === 'number' ? Math.floor(data.price) : 0,
    String(data.status || 'available'),
    typeof data.quantity === 'number' && Number.isFinite(data.quantity) ? Math.max(0, Math.floor(data.quantity)) : 0,
    String(data.descriptionen || ''), String(data.descriptionru || ''),
    JSON.stringify(Array.isArray(data.images) ? data.images : []),
    String(data.coverimage || ''), now, now
  )
  return { ok: true }
}

export function processSubmissionByType(db: DatabaseSync, row: { id: number; type: string }, payload: Record<string, unknown>) {
  switch (row.type) {
    case 'artist_registration': return approveArtistRegistration(db, payload)
    case 'release': return approveRelease(db, row.id, payload)
    case 'media_photo': return approveMediaPhoto(db, row.id, payload)
    case 'media_video': return approveMediaVideo(db, row.id, payload)
    case 'shop_product': return approveShopProduct(db, row.id, payload)
    default: return { error: `unknown type: ${row.type}` }
  }
}
