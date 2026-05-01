import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import compression from "compression";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import mime from "mime-types";
import { sendApiNotFound, sendApiRateLimited } from "./lib/api.mjs";
import { getAppSecret, requireEnv } from "./lib/config.mjs";
import { openAppDb } from "./lib/db.mjs";
import { loadDotEnv } from "./lib/env.mjs";
import { createMailer } from "./lib/mailer.mjs";
import { createOrderHub } from "./lib/order-hub.mjs";
import { startTrackingJob } from "./lib/tracking-job.mjs";
import { ReleaseDownloadService } from "./lib/release-download-service.mjs";
import { initLocalCache, getCacheRoot } from "./lib/local-cache-storage.mjs";
import { createReleaseRouter } from "./routes/releases.mjs";
import { createAuthRouter } from "./routes/auth.mjs";
import { createOrdersRouter } from "./routes/orders.mjs";
import { createShippingRouter } from "./routes/shipping.mjs";
import { createConfigRouter } from "./routes/config.mjs";
import { createYooKassaRouter } from "./routes/payments-yookassa.mjs";
import { createAdminRouter } from "./routes/admin.mjs";
import { cleanupExpiredSessions } from "./lib/sessions.mjs";
import { installApiErrorHandler } from "./middleware/api-error-handler.mjs";
import { installRequestIdMiddleware } from "./middleware/request-id.mjs";
import { installSessionMiddleware } from "./middleware/session.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT, "dist");
const PUBLIC_DIR = path.join(ROOT, "public");
const RELEASE_DATA_PATH = path.join(__dirname, "generated", "release-download-data.json");

const STATIC_PRECOMPRESSED_EXT_RE = /\.(?:js|css|html|json|svg|txt|xml|map|woff2?|ico)$/i;
const INLINE_THEME_BOOTSTRAP_HASH = "'sha256-mHfdDhiqAosniShduqMpUrB7hsKrxLsZAOHbEjmVFuk='";

loadDotEnv({ root: ROOT });
getAppSecret();
requireEnv("ADMIN_EMAIL");
requireEnv("ADMIN_PASSWORD");

const isDev = process.argv.includes("--dev");
const defaultPort = isDev ? 3002 : 3001;
const rawPort = String((isDev ? process.env.API_PORT || process.env.PORT : process.env.PORT) || "").trim();
const port = Number(rawPort) || defaultPort;
const host = process.env.HOSTNAME || "127.0.0.1";

function shouldRewriteToIndex(req) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  if (req.path === "/index.html") return false;
  if (req.path === "/api" || req.path.startsWith("/api/")) return false;

  const lastSegment = req.path.split("/").filter(Boolean).pop() ?? "";
  if (!lastSegment) return true; // "/"

  return !lastSegment.includes(".");
}

function precompressedStaticMiddleware(req, res, next) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return next();
  }

  const requestPath = (() => {
    try {
      return decodeURIComponent(req.path);
    } catch {
      return null;
    }
  })();

  if (!requestPath) {
    return next();
  }

  if (!STATIC_PRECOMPRESSED_EXT_RE.test(requestPath)) {
    return next();
  }

  const relativePath = requestPath.startsWith("/") ? requestPath.slice(1) : requestPath;
  const absolutePath = path.resolve(DIST_DIR, relativePath);
  if (!absolutePath.startsWith(DIST_DIR)) {
    return next();
  }

  const acceptedEncodings = String(req.headers["accept-encoding"] || "");
  let encodedSuffix = "";

  if (acceptedEncodings.includes("br") && existsSync(`${absolutePath}.br`)) {
    encodedSuffix = ".br";
    res.setHeader("Content-Encoding", "br");
  } else if (acceptedEncodings.includes("gzip") && existsSync(`${absolutePath}.gz`)) {
    encodedSuffix = ".gz";
    res.setHeader("Content-Encoding", "gzip");
  }

  if (!encodedSuffix) {
    return next();
  }

  const contentType = mime.lookup(requestPath);
  if (contentType) {
    res.setHeader("Content-Type", contentType);
  }

  res.setHeader("Vary", "Accept-Encoding");
  req.url = `${req.url}${encodedSuffix}`;
  return next();
}

const releaseDownloadService = new ReleaseDownloadService({
  root: ROOT,
  releaseDataPath: RELEASE_DATA_PATH
});

initLocalCache(ROOT);
await releaseDownloadService.bootstrap();

const { db } = openAppDb({ rootDir: ROOT });
cleanupExpiredSessions(db);
const mailer = createMailer();
const orderHub = createOrderHub();
startTrackingJob({ db, hub: orderHub });

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(installRequestIdMiddleware());
app.use(installSessionMiddleware({ db }));
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "img-src": [
          "'self'",
          "data:",
          "blob:",
          "https://api-maps.yandex.ru",
          "https://*.api-maps.yandex.ru",
          "https://*.maps.yandex.net",
          "https://yastatic.net",
          "https://*.yastatic.net",
          "https://yandex.ru",
          "https://yookassa.ru",
          "https://*.yookassa.ru",
          "https://yoomoney.ru",
          "https://*.yoomoney.ru"
        ],
        "media-src": ["'self'", "blob:"],
        "connect-src": [
          "'self'",
          "https://api-maps.yandex.ru",
          "https://*.api-maps.yandex.ru",
          "https://suggest-maps.yandex.ru",
          "https://search-maps.yandex.ru",
          "https://*.maps.yandex.net",
          "https://yastatic.net",
          "https://*.yastatic.net",
          "https://yandex.ru",
          "https://yookassa.ru",
          "https://*.yookassa.ru",
          "https://yoomoney.ru",
          "https://*.yoomoney.ru"
        ],
        "font-src": ["'self'", "data:", "https://yastatic.net", "https://*.yastatic.net"],
        "style-src": ["'self'", "'unsafe-inline'", "blob:", "https://yastatic.net", "https://*.yastatic.net"],
        "style-src-elem": ["'self'", "'unsafe-inline'", "blob:", "https://yastatic.net", "https://*.yastatic.net"],
        "script-src": [
          "'self'",
          "'unsafe-eval'",
          INLINE_THEME_BOOTSTRAP_HASH,
          "https://api-maps.yandex.ru",
          "https://*.api-maps.yandex.ru",
          "https://suggest-maps.yandex.ru",
          "https://*.maps.yandex.net",
          "https://yastatic.net",
          "https://*.yastatic.net",
          "https://yandex.ru",
          "https://yookassa.ru",
          "https://*.yookassa.ru",
          "https://yoomoney.ru",
          "https://*.yoomoney.ru"
        ],
        "frame-src": [
          "'self'",
          "https:",
          "https://api-maps.yandex.ru",
          "https://yookassa.ru",
          "https://*.yookassa.ru",
          "https://yoomoney.ru",
          "https://*.yoomoney.ru"
        ],
        "object-src": ["'none'"],
        "base-uri": ["'self'"],
        "frame-ancestors": ["'none'"]
      }
    }
  })
);
app.use(
  compression({
    filter: (req, res) => {
      if (req.path.endsWith(".zip")) return false;
      if (req.path.endsWith("/stream")) return false;
      if (String(req.get("accept") || "").includes("text/event-stream")) return false;
      return compression.filter(req, res);
    }
  })
);
app.use(express.json({ limit: "64kb" }));
app.use(express.urlencoded({ extended: false, limit: "64kb" }));

function apiRateLimit(options) {
  return rateLimit({
    ...options,
    handler: (req, res) => sendApiRateLimited(req, res)
  });
}

app.use(
  "/api",
  apiRateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false
  })
);
app.use(
  "/api/releases",
  apiRateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false
  }),
  createReleaseRouter({ service: releaseDownloadService })
);

app.use(
  "/api/auth",
  apiRateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false
  }),
  createAuthRouter({ db })
);

app.use(
  "/api/orders",
  apiRateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false
  }),
  createOrdersRouter({ db, hub: orderHub })
);

app.use(
  "/api/shipping",
  apiRateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false
  }),
  createShippingRouter()
);

app.use("/api/config", createConfigRouter());

app.use(
  "/api/admin",
  apiRateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false
  }),
  createAdminRouter({ db, hub: orderHub, service: releaseDownloadService })
);

// Serve locally cached transcoded files (tracks + zips)
app.use(
  "/media-cache",
  express.static(getCacheRoot(), {
    index: false,
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "public, max-age=86400");
    }
  })
);

app.use(
  "/api/payments/yookassa",
  apiRateLimit({
    windowMs: 60 * 1000,
    max: 240,
    standardHeaders: true,
    legacyHeaders: false
  }),
  createYooKassaRouter({ db, hub: orderHub })
);

app.get("/api/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.use("/api", (req, res) => sendApiNotFound(req, res));
app.use(installApiErrorHandler());

if (!isDev) {
  app.use(
    express.static(PUBLIC_DIR, {
      index: false,
      setHeaders: (res, filePath) => {
        const relative = path.relative(PUBLIC_DIR, filePath).split(path.sep).join("/");
        if (relative.startsWith("media/")) {
          res.setHeader("Cache-Control", "public, max-age=31536000");
          return;
        }

        if (relative.startsWith("locales/")) {
          res.setHeader("Cache-Control", "public, max-age=86400");
          return;
        }

        res.setHeader("Cache-Control", "public, max-age=86400");
      }
    })
  );

  app.use((req, _res, next) => {
    if (shouldRewriteToIndex(req)) {
      req.url = "/index.html";
    }
    next();
  });

  app.use(precompressedStaticMiddleware);

  app.use(
    express.static(DIST_DIR, {
      index: false,
      setHeaders: (res, filePath) => {
        const relative = path.relative(DIST_DIR, filePath).split(path.sep).join("/");
        if (relative.endsWith(".m3u8")) {
          res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
        } else if (relative.endsWith(".m4s")) {
          res.setHeader("Content-Type", "video/iso.segment");
        } else if (relative.endsWith(".mp4") && relative.includes("/stream/")) {
          res.setHeader("Content-Type", "audio/mp4");
        }

        if (relative.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-cache");
          return;
        }

        if (relative.startsWith("assets/") && /[.-][A-Za-z0-9_-]{8,}\./.test(path.basename(relative))) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          return;
        }

        if (relative.startsWith("media/")) {
          res.setHeader("Cache-Control", "public, max-age=31536000");
          return;
        }

        res.setHeader("Cache-Control", "public, max-age=86400");
      }
    })
  );
}

const server = app.listen(port, host, () => {
  const mode = isDev ? "api-dev" : "production";
  console.log(`d7tun6.site server listening on http://${host}:${port} (${mode})`);
});

server.ref();

// Some Windows/Node setups let the dev API process exit immediately after listen().
// Keep the event loop pinned explicitly in dev so concurrently does not tear down the Vite dev server.
const devKeepAlive = isDev ? setInterval(() => {}, 1 << 30) : null;

function shutdown() {
  if (devKeepAlive) {
    clearInterval(devKeepAlive);
  }
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
