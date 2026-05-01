import crypto from "node:crypto";

function makeRequestId() {
  return crypto.randomBytes(12).toString("base64url");
}

export function installRequestIdMiddleware() {
  return (req, res, next) => {
    const requestId = makeRequestId();
    req.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);
    return next();
  };
}

