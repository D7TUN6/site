import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
export const PALETTES_FILE = path.join(ROOT, "data", "palettes.json");
const BG_DIR = path.join(ROOT, "public", "media", "background");

async function extractColors(imagePath, count = 8) {
  const palettePath = path.join(ROOT, "tmp", `palette-tmp-${Date.now()}.png`);
  await fs.mkdir(path.dirname(palettePath), { recursive: true });

  try {
    await new Promise((resolve, reject) => {
      const proc = spawn("ffmpeg", [
        "-y", "-i", imagePath,
        "-vf", `scale=200:-1,palettegen=max_colors=${count}:reserve_transparent=0`,
        palettePath
      ], { stdio: ["ignore", "ignore", "pipe"] });
      const stderr = [];
      proc.stderr.on("data", (c) => stderr.push(Buffer.from(c)));
      proc.on("error", (e) => reject(new Error(`ffmpeg: ${e.message}`)));
      proc.on("close", (code) => {
        if (code === 0) return resolve();
        reject(new Error(Buffer.concat(stderr).toString("utf8").trim() || `ffmpeg exited ${code}`));
      });
    });

    const colors = await readPaletteColors(palettePath, count);
    return colors;
  } finally {
    await fs.rm(palettePath, { force: true });
  }
}

async function readPaletteColors(palettePath, count) {
  const raw = await new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", [
      "-i", palettePath,
      "-vf", `scale=${count}:1`,
      "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"
    ], { stdio: ["ignore", "pipe", "pipe"] });

    const chunks = [];
    proc.stdout.on("data", (c) => chunks.push(Buffer.from(c)));
    proc.on("error", (e) => reject(new Error(`ffmpeg: ${e.message}`)));
    proc.on("close", (code) => {
      if (code === 0) return resolve(Buffer.concat(chunks));
      reject(new Error(`ffmpeg palette read exited ${code}`));
    });
  });

  const colors = [];
  for (let i = 0; i < count && i * 3 + 2 < raw.length; i++) {
    const r = raw[i * 3];
    const g = raw[i * 3 + 1];
    const b = raw[i * 3 + 2];
    colors.push({ r, g, b, hex: `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}` });
  }
  return colors;
}

export function buildPaletteVars(colors) {
  if (!colors.length) return {};

  const accent = [...colors].sort((a, b) => saturation(b) - saturation(a))[0] ?? colors[0];
  const rgb = `${accent.r}, ${accent.g}, ${accent.b}`;

  return {
    "--accent-hot": accent.hex,
    "--accent-hot-rgb": rgb,
    "--accent-hot-glow": `rgba(${rgb}, 0.24)`,
    "--accent-hot-glow-soft": `rgba(${rgb}, 0.2)`,
    "--accent-hot-inset": `rgba(${rgb}, 0.36)`,
    "--accent-hot-status-bg": `rgba(${rgb}, 0.62)`
  };
}

function saturation({ r, g, b }) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return (max - min) / max;
}

export async function readPalettes() {
  try {
    const raw = await fs.readFile(PALETTES_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return { active: null, palettes: [] };
  }
}

export async function writePalettes(data) {
  await fs.mkdir(path.dirname(PALETTES_FILE), { recursive: true });
  await fs.writeFile(PALETTES_FILE, JSON.stringify(data, null, 2));
}

export async function generatePalette(imagePath, name) {
  const colors = await extractColors(imagePath, 8);
  const vars = buildPaletteVars(colors);
  const id = `palette-${Date.now()}`;
  return { id, name: name || id, colors, vars, createdAt: new Date().toISOString() };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const bgArg = process.argv.indexOf("--bg");
  const nameArg = process.argv.indexOf("--name");
  const imagePath = bgArg !== -1 ? process.argv[bgArg + 1] : path.join(BG_DIR, "bg.jpg");
  const name = nameArg !== -1 ? process.argv[nameArg + 1] : `palette-${new Date().toISOString().slice(0, 10)}`;

  const palette = await generatePalette(path.resolve(imagePath), name);
  const data = await readPalettes();
  data.palettes.push(palette);
  await writePalettes(data);
  console.log(`Generated palette "${palette.name}" with ${palette.colors.length} colors`);
}
