import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import compression from "compression";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import mime from "mime-types";
import { ReleaseDownloadService } from "./lib/release-download-service.mjs";
import { createReleaseRouter } from "./routes/releases.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT, "dist");
const RELEASE_DATA_PATH = path.join(__dirname, "generated", "release-download-data.json");

const STATIC_PRECOMPRESSED_EXT_RE = /\.(?:js|css|html|json|svg|txt|xml|map|woff2?|ico)$/i;

const isDev = process.argv.includes("--dev");
const defaultPort = isDev ? 3002 : 3001;
const port = Number(process.env.PORT || defaultPort);
const host = process.env.HOSTNAME || "127.0.0.1";

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

await releaseDownloadService.bootstrap();

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "img-src": ["'self'", "data:", "blob:"],
        "media-src": ["'self'", "blob:"],
        "connect-src": ["'self'"],
        "font-src": ["'self'", "data:"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "script-src": ["'self'"],
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
      return compression.filter(req, res);
    }
  })
);
app.use(express.json({ limit: "64kb" }));
app.use(express.urlencoded({ extended: false, limit: "64kb" }));
app.use(
  "/api",
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false
  })
);
app.use(
  "/api/releases",
  rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false
  }),
  createReleaseRouter({ service: releaseDownloadService })
);

app.get("/api/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

if (!isDev) {
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
          res.setHeader("Cache-Control", "public, max-age=86400");
          return;
        }

        res.setHeader("Cache-Control", "public, max-age=86400");
      }
    })
  );

  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(DIST_DIR, "index.html"));
  });
}

const server = app.listen(port, host, () => {
  const mode = isDev ? "api-dev" : "production";
  console.log(`d7tun6.site server listening on http://${host}:${port} (${mode})`);
});

server.ref();

// Some Windows/Node setups let the dev API process exit immediately after listen().
// Keep the event loop pinned explicitly in dev so concurrently does not tear down webpack-dev-server.
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
