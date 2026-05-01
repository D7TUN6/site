import { promises as fs } from "node:fs";
import path from "node:path";
import { build } from "vite";

const ROOT = process.cwd();

function resolveReportPath() {
  const raw = String(process.env.STATS_PATH || process.env.ANALYZE_PATH || "").trim();
  if (raw) return path.isAbsolute(raw) ? raw : path.join(ROOT, raw);
  return path.join(ROOT, "tmp", "vite-bundle-report.html");
}

async function main() {
  const mode = String(process.env.VITE_MODE || "production").trim() || "production";
  const reportPath = resolveReportPath();

  process.env.ANALYZE = "1";
  process.env.ANALYZE_PATH = reportPath;

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await build({ mode });

  console.log(`Wrote Vite bundle report: ${reportPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

