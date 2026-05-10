import { isProduction } from "./config.mjs";

function requestIdFromReq(req) {
  const candidate = req && typeof req === "object" && "requestId" in req ? req.requestId : null;
  return typeof candidate === "string" && candidate ? candidate : null;
}

function normalizeCode(raw) {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return "ERROR";
  if (!/^[A-Z0-9_]{2,64}$/.test(value)) return "ERROR";
  return value;
}

export function sendApiError(res, req, status, message, options = {}) {
  const requestId = requestIdFromReq(req);
  const code = normalizeCode(options.code);

  try {
    res.setHeader("Cache-Control", "no-store");
  } catch {
    // ignore
  }

  const payload = {
    ok: false,
    error: {
      code,
      message: String(message || "Error"),
      requestId
    }
  };

  if (options.details && !isProduction()) {
    payload.error.details = options.details;
  }

  return res.status(status).json(payload);
}

export function sendApiNotFound(req, res) {
  return sendApiError(res, req, 404, "Not found", { code: "NOT_FOUND" });
}

export function sendApiMethodNotAllowed(req, res) {
  return sendApiError(res, req, 405, "Method not allowed", { code: "METHOD_NOT_ALLOWED" });
}

export function sendApiRateLimited(req, res) {
  return sendApiError(res, req, 429, "Too many requests", { code: "RATE_LIMITED" });
}
