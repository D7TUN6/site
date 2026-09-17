import { validateEnv } from './lib/config.js'
import { initializeServices, startPeriodicTasks } from './init.js'
import { createApp } from './app.js'
import { runCleanups } from './lib/cleanup.js'

validateEnv()

const port = Number(process.env.WEB_PORT || process.env.PORT || 3001)
const hostname = process.env.HOSTNAME || '127.0.0.1'

const services = await initializeServices()
const app = createApp(services)
startPeriodicTasks(services.db)

app.listen({ port, hostname })

console.info(`${process.env.SITE_NAME || process.env.VITE_SITE_TITLE || 'd7tun6-site'} api listening on http://${hostname}:${port}`)

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err)
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason)
  process.exit(1)
})

process.on('SIGTERM', () => {
  runCleanups()
  app.server?.stop(true)
  process.exit(0)
})

process.on('SIGINT', () => {
  runCleanups()
  app.server?.stop(true)
  process.exit(0)
})
