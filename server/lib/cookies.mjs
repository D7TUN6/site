export function parseCookieHeader(headerValue) {
  const header = typeof headerValue === "string" ? headerValue : "";
  const out = {};

  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }

  return out;
}

export function getCookie(req, name) {
  const cookies = parseCookieHeader(req.get("cookie"));
  return cookies[name] ?? null;
}
