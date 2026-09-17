import { Elysia } from 'elysia'
import type { DatabaseSync } from '../lib/sqlite.js'
import { getCookieByName } from '../lib/cookies.js'
import { ADMIN_SESSION_COOKIE, USER_SESSION_COOKIE, getUserBySessionToken, isAdminSessionValid } from '../lib/sessions.js'

type AppUser = { id: number; email: string; emailVerified: boolean; role: string }

export function createSessionPlugin({ db }: { db: DatabaseSync }) {
  return (app: Elysia) =>
    app.derive(({ request }) => {
      let user: AppUser | null
      try {
        const sid = getCookieByName(request.headers.get('cookie'), USER_SESSION_COOKIE)
        user = sid ? getUserBySessionToken(db, sid) : null
      } catch {
        user = null
      }

      let isAdmin: boolean
      try {
        const asid = getCookieByName(request.headers.get('cookie'), ADMIN_SESSION_COOKIE)
        isAdmin = asid ? isAdminSessionValid(db, asid) : false
      } catch {
        isAdmin = false
      }

      return { user, isAdmin }
    })
}
