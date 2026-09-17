import { join } from 'node:path'
import { readFileSync } from 'node:fs'

function loadEnv(path) {
  try {
    return Object.fromEntries(
      readFileSync(path, 'utf8')
        .split('\n')
        .filter(l => l.trim() && !l.trim().startsWith('#'))
        .map(l => {
          const idx = l.indexOf('=')
          return [l.slice(0, idx), l.slice(idx + 1).replace(/^["']|["']$/g, '')]
        })
    )
  } catch {
    return {}
  }
}

const env = loadEnv(join(import.meta.dirname, '.env'))

export const apps = [
  {
    name: 'd7tun6-web',
    script: 'pm2-web.cjs',
    cwd: import.meta.dirname,
    interpreter: 'bun',
    // pm2 cluster mode requires node's cluster module — bun only supports fork
    exec_mode: 'fork',
    instances: 1,
    env,
    max_memory_restart: '1G',
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 5000,
    exp_backoff_restart_delay: 100,
    listen_timeout: 10000,
    kill_timeout: 5000,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: 'logs/pm2-web-error.log',
    out_file: 'logs/pm2-web-out.log',
    merge_logs: true,
    autorestart: true,
    watch: false,
  },
  {
    name: 'd7tun6-worker',
    script: 'node_modules/.bin/tsx',
    args: 'index.ts',
    cwd: join(import.meta.dirname, 'worker'),
    interpreter: 'none',
    env,
    max_memory_restart: '1G',
    min_uptime: '5s',
    max_restarts: 15,
    restart_delay: 3000,
    exp_backoff_restart_delay: 100,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: '../logs/pm2-worker-error.log',
    out_file: '../logs/pm2-worker-out.log',
    merge_logs: true,
    autorestart: true,
    watch: false,
  },
]

export default { apps }
