const DEFAULT_PORT_BY_PROTOCOL = {
  http: "80",
  https: "443"
};

function firstHeaderValue(value) {
  return typeof value === "string" ? value.split(",")[0].trim() : "";
}

function normalizeOrigin(value, fallbackProtocol = "") {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "null") {
    return null;
  }

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : fallbackProtocol ? `${fallbackProtocol}://${trimmed}` : "";
  if (!candidate) {
    return null;
  }

  try {
    const url = new URL(candidate);
    const protocol = url.protocol.slice(0, -1).toLowerCase();
    if (!(protocol in DEFAULT_PORT_BY_PROTOCOL)) {
      return null;
    }

    const hostname = url.hostname.toLowerCase();
    const port = url.port || DEFAULT_PORT_BY_PROTOCOL[protocol];
    return `${protocol}://${hostname}:${port}`;
  } catch {
    return null;
  }
}

function getExpectedOrigin(req) {
  const protocol = firstHeaderValue(req.get("x-forwarded-proto")) || req.protocol;
  const host = firstHeaderValue(req.get("x-forwarded-host")) || req.get("host");
  return normalizeOrigin(host, protocol);
}

function getSourceOrigin(req) {
  const origin = normalizeOrigin(firstHeaderValue(req.get("origin")));
  if (origin) {
    return origin;
  }

  return normalizeOrigin(firstHeaderValue(req.get("referer")));
}

export function enforceSameOrigin(req, res, next) {
  const fetchSite = firstHeaderValue(req.get("sec-fetch-site"));
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return res.status(403).json({ error: "Cross-site requests are not allowed" });
  }

  const expectedOrigin = getExpectedOrigin(req);
  if (!expectedOrigin) {
    return res.status(400).json({ error: "Unable to validate request origin" });
  }

  const sourceOrigin = getSourceOrigin(req);
  if (!sourceOrigin) {
    return next();
  }

  if (sourceOrigin !== expectedOrigin) {
    return res.status(403).json({ error: "Cross-site requests are not allowed" });
  }

  return next();
}
