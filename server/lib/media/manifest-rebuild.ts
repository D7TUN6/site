import { spawn } from 'node:child_process'

let rebuildTimeout: ReturnType<typeof setTimeout> | null = null

export function spawnRebuild() {
  if (rebuildTimeout) return
  rebuildTimeout = setTimeout(() => {
    rebuildTimeout = null
    const generator = spawn('bun', ['scripts/generate-releases.ts'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let genOutput = ''
    generator.stdout.on('data', (c: Buffer) => { genOutput += c.toString() })
    generator.stderr.on('data', (c: Buffer) => { genOutput += c.toString() })
    generator.on('close', (genCode) => {
      if (genCode !== 0) console.error('Release manifest generation failed:', genOutput)
      else console.info('Release manifest regenerated:', genOutput.trim())
    })
  }, 2000)
}

export async function runRebuild(): Promise<void> {
  return new Promise((resolve, reject) => {
    const generator = spawn('bun', ['scripts/generate-releases.ts'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    generator.stdout.on('data', (c: Buffer) => { output += c.toString() })
    generator.stderr.on('data', (c: Buffer) => { output += c.toString() })
    generator.on('close', (code) => {
      if (code !== 0) reject(new Error(`Manifest generation failed: ${output}`))
      else resolve()
    })
    generator.on('error', reject)
  })
}
