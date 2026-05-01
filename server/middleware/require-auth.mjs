export function requireUser(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
}

export function requireAdmin(req, res, next) {
  if (!req.isAdmin) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
}

