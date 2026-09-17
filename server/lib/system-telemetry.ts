import { loadavg, uptime, cpus, totalmem, freemem, availableParallelism } from 'node:os'
import { readlinkSync, readFileSync } from 'node:fs'

type NixosBuild = {
  label: string
  hash: string | null
  fullStorePath: string
}

function readNixosBuild(): NixosBuild {
  // /run/current-system is a symlink into the nix store:
  //   /nix/store/<hash>-nixos-system-<host>-<version>.<date>.<rev>
  // (with an optional trailing /sw or similar segment). The <rev> tail is the
  // nixpkgs revision, the store <hash> identifies the built system (which
  // incorporates the config flake's locked inputs), so both are useful as the
  // "current system build hash".
  try {
    const fullStorePath = readlinkSync('/run/current-system')
    const match = fullStorePath.match(/\/([a-z0-9]{32})-nixos-system-(.+?)(?:\/|$)/)
    const label = match ? match[2] : fullStorePath.split('/').pop() || fullStorePath
    // Short readable build: "<store8>-<label>"
    const hash = match ? `${match[1].slice(0, 8)}-${label}` : null
    return { label, hash, fullStorePath }
  } catch {
    return { label: '', hash: null, fullStorePath: '' }
  }
}

function readMemInfoMb(): { totalMb: number; availableMb: number; usedMb: number; usedPercent: number } {
  const total = totalmem()
  const free = freemem()
  // Prefer MemAvailable (modern, accounts for reclaimable cache).
  let available = total - free
  try {
    const data = readFileSync('/proc/meminfo', 'utf8')
    const line = data.split('\n').find((l) => l.startsWith('MemAvailable:'))
    if (line) available = Number(line.split(/\s+/)[1]) * 1024
  } catch { /* keep fallback */
  }
  const used = Math.max(0, total - available)
  return {
    totalMb: Math.round(total / 1024 / 1024),
    availableMb: Math.round(available / 1024 / 1024),
    usedMb: Math.round(used / 1024 / 1024),
    usedPercent: total > 0 ? Math.round((used / total) * 100) : 0,
  }
}

function cpuModel(): string {
  const c = cpus()
  return c.length > 0 ? c[0].model : ''
}

// True instantaneous CPU usage: delta over a short /proc/stat sample. loadavg
// is a run-queue length, not percent utilisation — using it for the bar made
// an idle box read as 100%.
function parseCpuTick(line: string): { total: number; idle: number } {
  const parts = line.trim().split(/\s+/).slice(1).map(Number)
  const idle = (parts[3] ?? 0) + (parts[4] ?? 0) // idle + iowait
  const total = parts.reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0)
  return { total, idle }
}

async function readCpuTick(): Promise<{ total: number; idle: number }> {
  const data = readFileSync('/proc/stat', 'utf8')
  const line = data.split('\n').find((l) => l.startsWith('cpu '))
  if (!line) return { total: 0, idle: 0 }
  return parseCpuTick(line)
}

async function sampleCpuUsage(): Promise<number> {
  try {
    const a = await readCpuTick()
    await new Promise((resolve) => setTimeout(resolve, 250))
    const b = await readCpuTick()
    const totalDelta = b.total - a.total
    const idleDelta = b.idle - a.idle
    if (totalDelta <= 0) return 0
    const busy = Math.max(0, totalDelta - idleDelta)
    return Math.round((busy / totalDelta) * 100)
  } catch {
    return 0
  }
}

export async function getSystemTelemetry() {
  const load = loadavg()
  const cpuCount = cpus().length
  const mem = readMemInfoMb()
  const nixos = readNixosBuild()
  return {
    hostUptimeSec: Math.round(uptime()),
    serverUptimeSec: Math.round(process.uptime()),
    cpuCount,
    cpuParallelism: typeof availableParallelism === 'function' ? availableParallelism() : cpuCount,
    cpuModel: cpuModel(),
    cpuPercent: await sampleCpuUsage(),
    loadavg: {
      one: round2(load[0]),
      five: round2(load[1]),
      fifteen: round2(load[2]),
    },
    mem,
    nixos,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}