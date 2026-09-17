import { chromium } from 'playwright'

const BASE_URL = process.env.BENCHMARK_URL || 'http://localhost:5173'
const CONCURRENT_USERS = parseInt(process.env.USERS || '20', 10)
const TEST_DURATION_MS = parseInt(process.env.DURATION || '120000', 10)
const THINK_MIN = 800
const THINK_MAX = 2500

const BLOCKED_PATTERNS = [
  '/api/social/plays',
  '/api/social/video-views',
  '/api/social/likes/toggle',
  '/api/social/video-likes/toggle',
  '/api/social/metrics/',
  '/api/social/video-stats/',
  '/api/radio/listeners',
  '/api/radio/now-playing',
  '/api/download/prepare',
  '/api/gallery/invalidate',
  'google-analytics',
  'googletagmanager',
  'amplitude',
  'mixpanel',
  'hotjar',
  'newrelic',
  'sentry',
  'doubleclick',
  'yandex-metrika',
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/orders',
  '/api/payments/',
  '/api/submissions',
]

const PAGES = [
  '/en/', '/ru/',
  '/en/bio', '/ru/bio',
  '/en/links', '/ru/links',
  '/en/legal', '/ru/legal',
  '/en/contact', '/ru/contact',
  '/en/git', '/ru/git',
  '/en/donate', '/ru/donate',
  '/en/music', '/ru/music',
  '/en/music/a-path-of-static-snow', '/ru/music/a-path-of-static-snow',
  '/en/music/a-path-of-static-snow-deluxe-analog-edition', '/ru/music/a-path-of-static-snow-deluxe-analog-edition',
  '/en/music/b-twin', '/ru/music/b-twin',
  '/en/music/ethixeat', '/ru/music/ethixeat',
  '/en/music/ido', '/ru/music/ido',
  '/en/music/obskr3-e', '/ru/music/obskr3-e',
  '/en/music/wh1te-hous3', '/ru/music/wh1te-hous3',
  '/en/music/wh1te-hous3-deluxe-analog-edition', '/ru/music/wh1te-hous3-deluxe-analog-edition',
  '/en/news', '/ru/news',
  '/en/news/site-launch', '/ru/news/site-launch',
  '/en/news/update-may-2025', '/ru/news/update-may-2025',
  '/en/news/update-dec-3-2025', '/ru/news/update-dec-3-2025',
  '/en/news/update-dec-2025', '/ru/news/update-dec-2025',
  '/en/news/happy-new-year-2026', '/ru/news/happy-new-year-2026',
  '/en/news/big-update-jan-2026', '/ru/news/big-update-jan-2026',
  '/en/blog', '/ru/blog',
  '/en/gallery', '/ru/gallery',
  '/en/gallery/release-covers', '/ru/gallery/release-covers',
  '/en/video', '/ru/video',
  '/en/video/d7tun6-intr0id-official-video-idm-tracker-music', '/ru/video/d7tun6-intr0id-official-video-idm-tracker-music',
  '/en/radio', '/ru/radio',
  '/en/shop', '/ru/shop',
  '/en/shop/b-twin', '/ru/shop/b-twin',
  '/en/shop/d7tun6-a-path-of-static-snow-cd-limited-edition', '/ru/shop/d7tun6-a-path-of-static-snow-cd-limited-edition',
  '/en/shop/d7tun6-wh1te-hous3-cd-limited-edition', '/ru/shop/d7tun6-wh1te-hous3-cd-limited-edition',
  '/en/cart', '/ru/cart',
  '/en/account', '/ru/account',
  '/en/projects', '/ru/projects',
  '/en/projects/oss-migrator', '/ru/projects/oss-migrator',
]

const stats = {
  activeSessions: 0,
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  statusCodes: {},
  pageLoadTimes: [],
  startTime: Date.now(),
  interactionCount: 0,
  errorDetails: [],
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pick(arr) {
  return arr[rand(0, arr.length - 1)]
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function blocked(url) {
  return BLOCKED_PATTERNS.some(p => url.includes(p))
}

async function setupContext(context, _userId) {
  await context.route('**/*', async (route) => {
    const url = route.request().url()
    if (blocked(url)) {
      await route.abort('blockedbyclient')
      return
    }
    if (route.request().method() !== 'GET') {
      await route.abort('blockedbyclient')
      return
    }
    await route.continue()
  })
}

async function randomInteractions(page) {
  const actions = ['scroll', 'hover', 'tab']
  const action = pick(actions)

  switch (action) {
    case 'scroll': {
      const maxScroll = await page.evaluate(() => Math.max(
        document.documentElement.scrollHeight - window.innerHeight, 100
      ))
      const positions = []
      const steps = rand(1, 3)
      for (let i = 0; i < steps; i++) {
        positions.push(rand(0, maxScroll))
      }
      for (const pos of positions) {
        await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'smooth' }), pos)
        await sleep(rand(200, 500))
      }
      break
    }
    case 'hover': {
      const links = await page.$$('a, button, [tabindex]')
      if (links.length > 0) {
        const el = links[rand(0, links.length - 1)]
        try { await el.hover({ timeout: 1000 }) } catch {}
      }
      break
    }
    case 'tab': {
      for (let i = 0; i < rand(1, 3); i++) {
        await page.keyboard.press('Tab')
        await sleep(rand(100, 300))
      }
      break
    }
  }
}

async function simulateUser(context, userId) {
  stats.activeSessions++

  try {
    const page = await context.newPage()

    page.on('requestfailed', (req) => {
      const method = req.method()
      if (method === 'GET') {
        stats.failedRequests++
        const errMsg = `${req.failure()?.errorText || 'unknown'}`
        stats.errorDetails.push(`${req.url().slice(0, 80)} — ${errMsg}`)
      }
    })

    page.on('response', (res) => {
      const status = res.status()
      stats.totalRequests++
      stats.statusCodes[status] = (stats.statusCodes[status] || 0) + 1
      if (status >= 200 && status < 400) {
        stats.successfulRequests++
      } else if (res.request().method() === 'GET') {
        stats.failedRequests++
        const path = new URL(res.url()).pathname
        stats.errorDetails.push(`${path} — ${status}`)
      }
    })

    const deadline = Date.now() + TEST_DURATION_MS

    while (Date.now() < deadline) {
      const path = pick(PAGES)
      const url = BASE_URL + path

      try {
        const navStart = Date.now()
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
        const loadTime = Date.now() - navStart
        stats.pageLoadTimes.push(loadTime)
        stats.interactionCount++

        await sleep(rand(200, 600))

        await randomInteractions(page)

        if (Math.random() < 0.3) {
          await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
          await sleep(rand(200, 400))
        }

        const thinkTime = rand(THINK_MIN, THINK_MAX)
        await sleep(thinkTime / 2)
        const midScroll = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight * 2)
        if (midScroll) {
          const scrollPos = rand(100, Math.max(100, await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)))
          await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'smooth' }), scrollPos)
        }
        await sleep(thinkTime / 2)
      } catch (err) {
        if (Date.now() < deadline) {
          if (!err.message?.includes('net::ERR_ABORTED')) {
            stats.errorDetails.push(`goto ${path}: ${err.message?.slice(0, 60) || err}`)
          }
          await sleep(2000)
        }
      }
    }

    await page.close()
  } catch (err) {
    stats.errorDetails.push(`user ${userId}: ${err.message?.slice(0, 60) || err}`)
  } finally {
    stats.activeSessions--
  }
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}m ${sec}s`
}

function printSummary() {
  const elapsed = Date.now() - stats.startTime
  const rps = elapsed > 0 ? (stats.totalRequests / (elapsed / 1000)).toFixed(1) : '0.0'
  const avgLoad = stats.pageLoadTimes.length > 0
    ? Math.round(stats.pageLoadTimes.reduce((a, b) => a + b, 0) / stats.pageLoadTimes.length)
    : 0
  const sortedCodes = Object.entries(stats.statusCodes).sort((a, b) => a[0] - b[0])
  const errorSummary = {}
  for (const e of stats.errorDetails) {
    const key = e.includes('—') ? e.split('—')[1]?.trim() || e : e
    errorSummary[key] = (errorSummary[key] || 0) + 1
  }
  const topErrors = Object.entries(errorSummary).sort((a, b) => b[1] - a[1]).slice(0, 5)

  console.log()
  console.log('═'.repeat(56))
  console.log('  BENCHMARK RESULTS')
  console.log('═'.repeat(56))
  console.log(`  Duration:        ${formatDuration(elapsed)}`)
  console.log(`  Concurrent users: ${CONCURRENT_USERS}`)
  console.log(`  Target URL:      ${BASE_URL}`)
  console.log('─'.repeat(56))
  console.log(`  Total requests:  ${stats.totalRequests}`)
  console.log(`  Successful:      ${stats.successfulRequests}`)
  console.log(`  Failed:          ${stats.failedRequests}`)
  console.log(`  Interactions:    ${stats.interactionCount}`)
  console.log(`  RPS:             ${rps}`)
  console.log(`  Avg page load:   ${avgLoad}ms`)
  console.log(`  P95 page load:   ${percentile(stats.pageLoadTimes, 95)}ms`)
  console.log(`  P99 page load:   ${percentile(stats.pageLoadTimes, 99)}ms`)
  console.log('─'.repeat(56))
  console.log('  Status codes:')
  for (const [code, count] of sortedCodes) {
    console.log(`    ${code}: ${count}`)
  }
  if (topErrors.length > 0) {
    console.log('─'.repeat(56))
    console.log('  Top errors:')
    for (const [err, count] of topErrors.slice(0, 3)) {
      const label = err.length > 50 ? err.slice(0, 47) + '...' : err
      console.log(`    [${count}x] ${label}`)
    }
  }
  console.log('═'.repeat(56))
  console.log()
}

function percentile(arr, p) {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

async function main() {
  console.log()
  console.log('═'.repeat(56))
  console.log('  BENCHMARK — d7tun6.site')
  console.log('═'.repeat(56))
  console.log(`  Users:     ${CONCURRENT_USERS}`)
  console.log(`  Duration:  ${formatDuration(TEST_DURATION_MS)}`)
  console.log(`  Target:    ${BASE_URL}`)
  console.log(`  Blocked:   ${BLOCKED_PATTERNS.length} patterns`)
  console.log(`  Pages:     ${PAGES.length} routes`)
  console.log('═'.repeat(56))
  console.log()

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  const contexts = []
  const userPromises = []

  for (let i = 0; i < CONCURRENT_USERS; i++) {
    const context = await browser.newContext({
      viewport: { width: rand(1024, 1920), height: rand(600, 1080) },
      userAgent: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.0.0 Safari/537.36`,
      locale: Math.random() < 0.5 ? 'en-US' : 'ru-RU',
    })
    await setupContext(context, i)
    contexts.push(context)
    userPromises.push(simulateUser(context, i))
  }

  const displayInterval = setInterval(() => {
    const elapsed = Date.now() - stats.startTime
    const remaining = Math.max(0, TEST_DURATION_MS - elapsed)
    const rps = elapsed > 0 ? (stats.totalRequests / (elapsed / 1000)).toFixed(1) : '0.0'
    const codes = Object.entries(stats.statusCodes)
      .filter(([c]) => c >= 400)
      .map(([c, n]) => `${c}:${n}`)
      .join(' ') || 'none'

    const line1 = `  Active: ${stats.activeSessions}  RPS: ${rps}  Reqs: ${stats.totalRequests}  OK: ${stats.successfulRequests}`
    const line2 = `  Errors: ${stats.failedRequests} [${codes}]  Remaining: ${formatDuration(remaining)}`
    process.stdout.write('\x1b[2K\r' + line1 + '\n')
    process.stdout.write('\x1b[2K\r' + line2 + '\r')
    process.stdout.write('\x1b[1A')
    process.stdout.write('\x1b[1A')
  }, 1000)

  await new Promise(r => setTimeout(r, TEST_DURATION_MS))

  clearInterval(displayInterval)
  process.stdout.write('\n\n')

  for (const context of contexts) {
    await context.close().catch(() => {})
  }
  await browser.close()

  printSummary()
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
