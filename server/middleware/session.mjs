import { getCookie } from "../lib/cookies.mjs";
import { ADMIN_SESSION_COOKIE, USER_SESSION_COOKIE, getUserBySessionToken, isAdminSessionValid } from "../lib/sessions.mjs";

export function installSessionMiddleware({ db }) {
  return (req, _res, next) => {
    try {
      const sid = getCookie(req, USER_SESSION_COOKIE);
      req.user = sid ? getUserBySessionToken(db, sid) : null;
    } catch (error) {
      console.error("user session lookup failed", error);
      req.user = null;
    }

    try {
      const asid = getCookie(req, ADMIN_SESSION_COOKIE);
      req.isAdmin = asid ? isAdminSessionValid(db, asid) : false;
    } catch (error) {
      console.error("admin session lookup failed", error);
      req.isAdmin = false;
    }

    return next();
  };
}

