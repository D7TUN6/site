import type { RequestHandler } from 'express'
import type { DatabaseSync } from 'node:sqlite'
import { getCookie } from '../lib/cookies.js'
import { ADMIN_SESSION_COOKIE, USER_SESSION_COOKIE, getUserBySessionToken, isAdminSessionValid } from '../lib/sessions.js'

export function installSessionMiddleware({ db }: { db: DatabaseSync }): RequestHandler {
  return (req, _res, next) => {
    try {
      const sid = getCookie(req, USER_SESSION_COOKIE)
      req.user = sid ? getUserBySessionToken(db, sid) : null
    } catch {
      req.user = null
    }

    try {
      const asid = getCookie(req, ADMIN_SESSION_COOKIE)
      req.isAdmin = asid ? isAdminSessionValid(db, asid) : false
    } catch {
      req.isAdmin = false
    }

    return next()
  }
}
