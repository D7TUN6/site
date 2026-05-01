import { readFileSync } from "node:fs";
import path from "node:path";

function parseDotEnvValue(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const quote = trimmed[0];
  if (quote !== "'" && quote !== '"') {
    return trimmed;
  }

  if (trimmed.length < 2 || trimmed[trimmed.length - 1] !== quote) {
    return trimmed.slice(1);
  }

  const inner = trimmed.slice(1, -1);
  if (quote === "'") {
    return inner;
  }

  return inner.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

export function loadDotEnv({ root, fileName = ".env" } = {}) {
  const base = root ? String(root) : process.cwd();
  const envPath = path.resolve(base, fileName);

  let content;
  try {
    content = readFileSync(envPath, "utf8");
  } catch {
    return { loaded: false, path: envPath };
  }

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const index = trimmed.indexOf("=");
    if (index <= 0) continue;

    const key = trimmed.slice(0, index).trim();
    if (!key) continue;

    const valueRaw = trimmed.slice(index + 1);
    const value = parseDotEnvValue(valueRaw);

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }

  return { loaded: true, path: envPath };
}
