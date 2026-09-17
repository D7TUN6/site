import { createEffect, createMemo, createSignal, For, Show, onCleanup, onMount } from 'solid-js'
import { Pause, Play, SkipBack, SkipForward } from 'lucide-solid'
import { usePlayer } from '@/features/player/usePlayer'
import { getAudioEngine } from '@/lib/audio/audio-engine.js'
import { getAllReleases } from '@/lib/releaseManifest.js'
import { getAllNewsPosts, getAllBlogPosts } from '@/lib/blog'
import { getHomeSystem, getHomeGithub, getHomeProduction, type HomeSystem, type HomeGithub, type ProductionStatus, type ProductionService } from '@/lib/api/home'
import { renderSimpleMarkdown } from '@/lib/simpleMarkdown'
import { getPageMarkdown } from '@/lib/pages'
import { LazyMedia } from '@/components/lazy-media'
import type { Lang, ReleaseEntry } from '@/types/content'

const BAR_WIDTH = 16

type HomeNavigate = (href: string, event?: MouseEvent) => void

function asciiBar(frac: number, width = BAR_WIDTH): { on: string; off: string; frac01: number } {
  const value = Math.max(0, Math.min(1, Number.isFinite(frac) ? frac : 0))
  const filled = Math.round(value * width)
  const on = '\u2588'.repeat(filled)
  const off = '\u00b7'.repeat(width - filled)
  return { on, off, frac01: value }
}

function fmtUptime(sec: number): string {
  if (!Number.isFinite(sec)) return '--'
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

const YEKT_CLOCK = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Yekaterinburg',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

function fmtClock(timestamp: number): string {
  return YEKT_CLOCK.format(timestamp)
}

function HomeBlockTitle(props: { children: string; right?: string }) {
  return (
    <h2 class="home-block-title">
      <span class="home-block-title-bracket">[ </span>
      {props.children}
      <span class="home-block-title-bracket"> ]</span>
      <Show when={props.right}><span class="home-block-title-right">{props.right}</span></Show>
    </h2>
  )
}

// ── System status ───────────────────────────────────────────────

type SystemCopy = {
  uptimeSite: string; uptimeHost: string; load: string; cpu: string; cores: string
  model: string; mem: string; memUsed: string; activeNodes: string; nixos: string
  waiting: string; unreachable: string
}

function systemCopy(lang: Lang): SystemCopy {
  return lang === 'ru' ? {
    uptimeSite: 'аптайм сайта', uptimeHost: 'аптайм хоста', load: 'нагрузка 1/5/15',
    cpu: 'процессор', cores: 'ядра', model: 'модель', mem: 'память', memUsed: 'память занято',
    activeNodes: 'активные узлы', nixos: 'nixos', waiting: 'ожидание…',
    unreachable: 'метрики системы недоступны',
  } : {
    uptimeSite: 'uptime site', uptimeHost: 'uptime host', load: 'load 1/5/15',
    cpu: 'cpu', cores: 'cores', model: 'model', mem: 'mem', memUsed: 'mem used',
    activeNodes: 'active_nodes', nixos: 'nixos', waiting: 'waiting…',
    unreachable: 'system metrics unreachable',
  }
}

// Renders every metric row from the very first paint so the block keeps a
// stable height; missing data shows `--` instead of growing the layout.
function SystemRows(props: { data: () => HomeSystem | null; copy: SystemCopy }) {
  const d = createMemo(() => props.data())
  const memBar = () => asciiBar(d() ? d()!.mem.usedPercent / 100 : 0)
  const cpuBar = () => asciiBar(d() ? d()!.cpuPercent / 100 : 0)
  return (
    <div class="home-rows">
      <div class="home-row"><span class="home-row-label">{props.copy.uptimeSite}</span><span class="home-row-value">{d() ? fmtUptime(d()!.serverUptimeSec) : '--'}</span></div>
      <div class="home-row"><span class="home-row-label">{props.copy.uptimeHost}</span><span class="home-row-value">{d() ? fmtUptime(d()!.hostUptimeSec) : '--'}</span></div>
      <div class="home-row"><span class="home-row-label">{props.copy.load}</span><span class="home-row-value">{d() ? `${d()!.loadavg.one} / ${d()!.loadavg.five} / ${d()!.loadavg.fifteen}` : '--'}</span></div>
      <div class="home-row"><span class="home-row-label">{props.copy.cpu}</span><span class="home-row-meter"><span class="dbar-on">{cpuBar().on}</span><span class="dbar-off">{cpuBar().off}</span></span><span class="home-row-pct">{d() ? `${d()!.cpuPercent}%` : '--'}</span></div>
      <div class="home-row"><span class="home-row-label">{props.copy.cores}</span><span class="home-row-value">{d() ? `${d()!.cpuCount} (${d()!.cpuParallelism} Parallel)` : '--'}</span></div>
      <div class="home-row"><span class="home-row-label">{props.copy.model}</span><span class="home-row-value">{d() ? d()!.cpuModel : '--'}</span></div>
      <div class="home-row"><span class="home-row-label">{props.copy.mem}</span><span class="home-row-value">{d() ? `${d()!.mem.usedMb}MB / ${d()!.mem.totalMb}MB` : '--'}</span></div>
      <div class="home-row"><span class="home-row-label">{props.copy.memUsed}</span><span class="home-row-meter"><span class="dbar-on">{memBar().on}</span><span class="dbar-off">{memBar().off}</span></span><span class="home-row-pct">{d() ? `${d()!.mem.usedPercent}%` : '--'}</span></div>
      <div class="home-row"><span class="home-row-label">{props.copy.activeNodes}</span><span class="home-row-value">{d() ? d()!.activeNodes : '--'}</span></div>
      <div class="home-row"><span class="home-row-label">{props.copy.nixos}</span><span class="home-row-value">{d() ? (d()!.nixos.hash ?? 'unknown') : '--'}</span></div>
    </div>
  )
}

function SystemBlock(props: { lang: Lang }) {
  const [sys, setSys] = createSignal<HomeSystem | null>(null)
  const [err, setErr] = createSignal(false)
  const [tick, setTick] = createSignal(Date.now())

  createEffect(() => {
    let alive = true
    const load = () => {
      getHomeSystem()
        .then((data) => { if (alive) { setSys(data); setErr(false) } })
        .catch(() => { if (alive) setErr(true) })
    }
    load()
    const iv = setInterval(load, 5000)
    const clock = setInterval(() => setTick(Date.now()), 1000)
    onCleanup(() => { alive = false; clearInterval(iv); clearInterval(clock) })
  })

  return (
    <section class="home-block" aria-label="System status">
      <HomeBlockTitle right={fmtClock(tick())}>system status</HomeBlockTitle>
      <Show when={err() && !sys()} fallback={
        <SystemRows data={sys} copy={systemCopy(props.lang)} />
      }>
        <div class="home-rows home-rows-error">
          <div class="home-row"><span class="home-row-label">{systemCopy(props.lang).unreachable}</span></div>
        </div>
      </Show>
    </section>
  )
}

// ── GitHub / activity ───────────────────────────────────────────

type ActivityCopy = {
  stars: string; repos: string; followers: string; commits: string
  contributed: string; latest: string; stale: string; unreachable: string
}

function activityCopy(lang: Lang): ActivityCopy {
  return lang === 'ru' ? {
    stars: 'звёзды', repos: 'репозитории', followers: 'подписчики', commits: 'коммитов в году',
    contributed: 'contrib', latest: 'последние коммиты', stale: 'кеш', unreachable: 'github недоступен',
  } : {
    stars: 'stars', repos: 'repos', followers: 'followers', commits: 'commits/yr',
    contributed: 'contrib', latest: 'latest commits', stale: 'cached', unreachable: 'github unreachable',
  }
}

// Same full-height structure from the first paint; values fill in without
// moving the layout when the profile arrives.
function ActivityContent(props: { gh: () => HomeGithub | null; lang: Lang }) {
  const copy = createMemo(() => activityCopy(props.lang))
  const stats = createMemo(() => props.gh()?.stats)
  return (
    <>
      <div class="home-rows">
        <div class="home-row"><span class="home-row-label">{copy().stars}</span><span class="home-row-value">{stats() ? stats()!.stars : '--'}</span></div>
        <div class="home-row"><span class="home-row-label">{copy().repos}</span><span class="home-row-value">{stats() ? stats()!.publicRepos : '--'}</span></div>
        <div class="home-row"><span class="home-row-label">{copy().followers}</span><span class="home-row-value">{stats() ? stats()!.followers : '--'}</span></div>
        <div class="home-row"><span class="home-row-label">{copy().commits}</span><span class="home-row-value">{stats() ? stats()!.commitsThisYear : '--'}</span></div>
        <div class="home-row"><span class="home-row-label">{copy().contributed}</span><span class="home-row-value">{stats()?.contributedProjects.length
          ? stats()!.contributedProjects.map((p) => p.name).join(', ')
          : '—'}</span></div>
      </div>
      <div class="home-commits">
        <div class="home-commits-title">{copy().latest}</div>
        <Show when={props.gh()?.latestCommits?.length} fallback={<CommitsSkeleton />}>
          <For each={props.gh()!.latestCommits}>
            {(commit) => (
              <a class="home-commit" href={commit.url} target="_blank" rel="noreferrer noopener">
                <span class="home-commit-sha">{commit.sha}</span>
                <span class="home-commit-msg">{commit.message}</span>
                <span class="home-commit-repo">{commit.repo}</span>
                <span class="home-commit-date">{commit.date}</span>
              </a>
            )}
          </For>
        </Show>
      </div>
    </>
  )
}

function CommitsSkeleton() {
  return (
    <div aria-hidden="true">
      {Array.from({ length: 4 }, () => (
        <div class="home-commit">
          <span class="home-commit-sha">―――</span>
          <span class="home-commit-msg home-feed-ph">―――――――――――――</span>
          <span class="home-commit-repo">――</span>
          <span class="home-commit-date">――――</span>
        </div>
      ))}
    </div>
  )
}

function ActivityBlock(props: { lang: Lang; navigate: HomeNavigate }) {
  const [gh, setGh] = createSignal<HomeGithub | null>(null)
  const [err, setErr] = createSignal(false)
  let consecutiveFailures = 0

  createEffect(() => {
    let alive = true
    const load = () => {
      getHomeGithub()
        .then((data) => {
          if (!alive) return
          setGh(data)
          setErr(false)
          consecutiveFailures = 0
        })
        .catch(() => {
          if (!alive) return
          // Only surface the error banner after repeated failures so a single
          // transient miss keeps the last-known rows + skeleton on screen.
          consecutiveFailures += 1
          if (consecutiveFailures >= 3) setErr(true)
        })
    }
    load()
    const iv = setInterval(load, 30_000)
    onCleanup(() => { alive = false; clearInterval(iv) })
  })

  const copy = () => activityCopy(props.lang)

  return (
    <section class="home-block" aria-label="GitHub activity">
      <HomeBlockTitle right={gh()?.stale ? copy().stale : undefined}>github — d7tun6</HomeBlockTitle>
      <Show when={err()} fallback={<ActivityContent gh={gh} lang={props.lang} />}>
        <div class="home-rows home-rows-error">
          <div class="home-row"><span class="home-row-label">{copy().unreachable}</span></div>
        </div>
      </Show>
    </section>
  )
}

// ── Now playing + oscilloscope ─────────────────────────────────

function NowPlayingBlock(props: { lang: Lang; navigate: HomeNavigate }) {
  const player = usePlayer()
  let canvasRef: HTMLCanvasElement | undefined
  let raf = 0
  let scopeNode: { analyser: AnalyserNode; disconnect: () => void } | null = null

  const isPlaying = () => Boolean(player.state.playing && ((player.state.queue && player.currentTrack()) || player.state.radioActive))
  const isRadio = () => player.state.radioActive
  const playTitle = () => player.state.radioActive ? (player.state.radioTrack?.title ?? '—') : player.currentTrack()!.title
  const playArtist = () => player.state.radioActive ? (player.state.radioTrack?.artist || 'D7TUN6 · radio') : `${player.state.queue!.artist} — ${player.state.queue!.albumTitle}`

  createEffect(() => {
    if (isPlaying() && !scopeNode) acquireScope()
  })

  const acquireScope = () => {
    const engine = getAudioEngine()
    const got = engine.createScopeAnalyser()
    if (!got || !canvasRef) return
    scopeNode = got
    drawScope()
  }

  const drawScope = () => {
    const canvas = canvasRef
    const node = scopeNode
    if (!canvas || !node) return
    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (w === 0 || h === 0) { raf = requestAnimationFrame(drawScope); return }
    canvas.width = Math.max(1, Math.floor(w * dpr))
    canvas.height = Math.max(1, Math.floor(h * dpr))
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const data = new Uint8Array(node.analyser.fftSize)
    node.analyser.getByteTimeDomainData(data)
    ctx.fillStyle = 'rgba(7, 7, 12, 0.9)'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = 'rgba(183, 166, 255, 0.95)'
    ctx.lineWidth = 2
    ctx.shadowBlur = 0
    ctx.beginPath()
    const step = w / data.length
    for (let i = 0; i < data.length; i++) {
      const x = i * step
      const y = h / 2 - ((data[i] - 128) / 128) * (h / 2 - 5)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    ctx.globalAlpha = 0.55
    ctx.fillStyle = 'rgba(183, 166, 255, 0.5)'
    ctx.fillRect(0, h / 2 - 0.5, w, 1)
    ctx.globalAlpha = 1
    raf = requestAnimationFrame(drawScope)
  }

  onMount(() => {
    if (player.state.playing && !scopeNode) acquireScope()
  })

  onCleanup(() => {
    cancelAnimationFrame(raf)
    scopeNode?.disconnect()
    scopeNode = null
  })

  const progress = () => {
    if (player.state.radioActive) {
      const np = player.state.radioTrack
      if (!np || np.duration <= 0) return 0
      return Math.max(0, Math.min(100, (np.elapsed / np.duration) * 100))
    }
    if (player.state.duration <= 0) return 0
    return Math.max(0, Math.min(100, (player.state.currentTime / player.state.duration) * 100))
  }

  return (
    <section class="home-block home-block-now" aria-label="Now playing">
      <HomeBlockTitle right={isPlaying() ? 'playing' : 'idle'}>now playing</HomeBlockTitle>
      <Show when={isPlaying() && (player.currentTrack() || player.state.radioActive)} fallback={
        <div class="home-now-idle">
          <div class="home-now-idle-signal">{props.lang === 'ru' ? '[ standby — нет сигнала ]' : '[ standby — no signal ]'}</div>
          <button class="home-now-nominal" type="button" onClick={() => props.navigate(`/${props.lang}/music`)}>
            {props.lang === 'ru' ? '> включить музыку' : '> start some music'}
          </button>
        </div>
      }>
        <div class="home-now-track">
          <div class="home-now-meta">
            <button class="home-now-title" type="button" onClick={() => props.navigate(isRadio() ? `/${props.lang}/radio` : `/${props.lang}/music/${player.state.queue!.queueKey}`)}>
              {playTitle()}
            </button>
            <span class="home-now-artist">{playArtist()}</span>
          </div>
          <div class="home-now-controls">
            <button type="button" class="home-now-btn" aria-label="Previous" disabled={isRadio()} onClick={() => player.prevTrack()}><SkipBack class="home-now-icon" /></button>
            <button type="button" class="home-now-btn home-now-btn-main" aria-label={player.state.playing ? 'Pause' : 'Play'} onClick={() => player.togglePlayPause()}>
              <Show when={player.state.playing} fallback={<Play class="home-now-icon" />}>
                <Pause class="home-now-icon" />
              </Show>
            </button>
            <button type="button" class="home-now-btn" aria-label="Next" disabled={isRadio()} onClick={() => player.nextTrack()}><SkipForward class="home-now-icon" /></button>
          </div>
        </div>
        <canvas ref={canvasRef} class="home-scope" aria-label="Oscilloscope" />
        <div class="home-now-time">
          <Show when={isRadio()} fallback={<><span>{fmtTrackTime(player.state.currentTime)}</span><span>{fmtTrackTime(player.state.duration)}</span></>}>
            <span>{fmtTrackTime(player.state.radioTrack?.elapsed ?? 0)}</span>
            <span>{fmtTrackTime(player.state.radioTrack?.duration ?? 0)}</span>
          </Show>
        </div>
        <div class="home-now-progress" role="progressbar" aria-valuemin={0} aria-valuemax={Math.max(isRadio() ? (player.state.radioTrack?.duration ?? 0) : player.state.duration, 1)} aria-valuenow={isRadio() ? (player.state.radioTrack?.elapsed ?? 0) : player.state.currentTime}>
          <span class="home-now-progress-fill" style={{ width: `${progress()}%` }} />
        </div>
      </Show>
    </section>
  )
}

function fmtTrackTime(seconds: number | null): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// ── Feed (news + blog) ─────────────────────────────────────────

function BlogFeedSkeleton() {
  return (
    <ul class="home-feed-list" aria-hidden="true">
      {Array.from({ length: 3 }, () => (
        <li><span class="home-feed-ph">―――――――</span><span class="home-feed-date">…</span></li>
      ))}
    </ul>
  )
}

function FeedBlock(props: { lang: Lang; navigate: HomeNavigate }) {
  const news = () => getAllNewsPosts(props.lang).slice(0, 3)
  const blog = () => getAllBlogPosts(props.lang).slice(0, 3)

  return (
    <section class="home-block" aria-label="Feed">
      <HomeBlockTitle>feed</HomeBlockTitle>
      <Show when={news().length > 0}>
        <div class="home-feed-group">{props.lang === 'ru' ? 'новости' : 'news'}</div>
        <ul class="home-feed-list">
          <For each={news()}>
            {(post) => (
              <li><a href={`/${props.lang}/news/${post.slug}`} onClick={(e) => props.navigate(`/${props.lang}/news/${post.slug}`, e)}>{post.title}</a><span class="home-feed-date">{post.publishedAt}</span></li>
            )}
          </For>
        </ul>
      </Show>
      <div class="home-feed-group">{props.lang === 'ru' ? 'журнал' : 'blog'}</div>
      <Show when={blog().length > 0} fallback={<BlogFeedSkeleton />}>
        <ul class="home-feed-list">
          <For each={blog()}>
            {(post) => (
              <li><a href={`/${props.lang}/blog/${post.slug}`} onClick={(e) => props.navigate(`/${props.lang}/blog/${post.slug}`, e)}>{post.title}</a><span class="home-feed-date">{post.publishedAt}</span></li>
            )}
          </For>
        </ul>
      </Show>
      <Show when={news().length === 0 && blog().length === 0}>
        <pre class="home-ascii">feed empty</pre>
      </Show>
    </section>
  )
}

// ── Discography index ──────────────────────────────────────────

function DiscographyBlock(props: { lang: Lang; navigate: HomeNavigate }) {
  const releases = () => getAllReleases().filter((r) => !(r as ReleaseEntry & { hidden?: boolean }).hidden)

  return (
    <section class="home-block home-block-wide" aria-label="Discography">
      <HomeBlockTitle right={`${releases().length} release${releases().length === 1 ? '' : 's'}`}>discography</HomeBlockTitle>
      <Show when={releases().length > 0} fallback={<pre class="home-ascii">no releases yet</pre>}>
        <ul class="home-disk-list">
          <For each={releases()}>
            {(release) => (
              <li>
                <span class="home-disk-date">{release.releaseDate}</span>
                <span class="home-disk-type">{String(release.releaseType || 'album').toUpperCase()}</span>
                <a href={`/${props.lang}/music/${release.slug}`} onClick={(e) => props.navigate(`/${props.lang}/music/${release.slug}`, e)}>{release.albumName}</a>
                <span class="home-disk-count">{release.tracks.length} trk</span>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </section>
  )
}

// ── Dotfiles / repos ─────────────────────────────────────────

const DOTFILES_REPOS: Array<{ name: string; url: string }> = [
  { name: 'NixOS-config', url: 'https://github.com/D7TUN6/NixOS-config' },
  { name: 'site', url: 'https://github.com/D7TUN6/site' },
  { name: 'BoxChat', url: 'https://github.com/D7TUN6/BoxChat' },
  { name: 'Server1-NixOS', url: 'https://github.com/D7TUN6/Server1-NixOS' },
]

function DotfilesBlock() {
  return (
    <section class="home-block" aria-label="Dotfiles and repositories">
      <HomeBlockTitle>dotfiles / nixos</HomeBlockTitle>
      <pre class="home-ascii">
        {`nixos flake   ${DOTFILES_REPOS[0].url.replace('https://', '')}`}
      </pre>
      <ul class="home-disk-list">
        <For each={DOTFILES_REPOS}>
          {(repo) => (
            <li>
              <span class="home-disk-type">git</span>
              <a href={repo.url} target="_blank" rel="noreferrer noopener">{repo.name}</a>
            </li>
          )}
        </For>
      </ul>
    </section>
  )
}

// ── Production status ────────────────────────────────────────

const PROD_GROUP_LABELS: Record<string, string> = {
  bots: 'telegram / bots',
  combox: 'combox',
  minecraft: 'minecraft',
  media: 'media / dl',
  edge: 'edge / proxy',
  ai: 'ai',
  data: 'data',
}

const PROD_STATE_GLYPH: Record<ProductionService['state'], string> = {
  up: 'UP',
  down: 'DN',
  error: 'ERR',
}

type ProdCopy = { waiting: string; cached: string; unreachable: string }

function prodCopy(lang: Lang): ProdCopy {
  return lang === 'ru' ? {
    waiting: 'ожидание…',
    cached: 'кеш',
    unreachable: 'статус продакшена недоступен',
  } : {
    waiting: 'waiting…',
    cached: 'cached',
    unreachable: 'production status unreachable',
  }
}

function ProdGroupRows(props: { groups: () => ProductionService[][] }) {
  return (
    <>
      <For each={props.groups()}>
        {(services) => {
          const group = services[0]?.group ?? '—'
          return (
            <>
              <div class="home-prod-group">{PROD_GROUP_LABELS[group] ?? group}</div>
              <For each={services}>
                {(s) => (
                  <div class={`home-prod-row home-prod-${s.state}`}>
                    <span class="home-prod-status">{PROD_STATE_GLYPH[s.state]}</span>
                    <span class="home-prod-name">{s.name}</span>
                    <span class="home-prod-uptime">{s.state === 'up' ? fmtUptime(s.uptimeSec) : '--'}</span>
                  </div>
                )}
              </For>
            </>
          )
        }}
      </For>
    </>
  )
}

function ProductionStatusBlock(props: { lang: Lang }) {
  const [data, setData] = createSignal<ProductionStatus | null>(null)
  const [err, setErr] = createSignal(false)
  let consecutiveFailures = 0

  createEffect(() => {
    let alive = true
    const load = () => {
      getHomeProduction()
        .then((d) => {
          if (!alive) return
          setData(d)
          setErr(false)
          consecutiveFailures = 0
        })
        .catch(() => {
          if (!alive) return
          consecutiveFailures += 1
          if (consecutiveFailures >= 3) setErr(true)
        })
    }
    load()
    const iv = setInterval(load, 10_000)
    onCleanup(() => { alive = false; clearInterval(iv) })
  })

  const copy = () => prodCopy(props.lang)

  const services = createMemo(() => (data()?.services ?? []).filter((s) => s.group !== 'ai'))

  const groups = createMemo(() => {
    const out: ProductionService[][] = []
    for (const s of services()) {
      const tail = out[out.length - 1]
      if (!tail || tail[0].group !== s.group) out.push([s])
      else tail.push(s)
    }
    return out
  })

  const stats = createMemo(() => {
    const rows = services()
    const up = rows.filter((s) => s.state === 'up').length
    return { up, total: rows.length }
  })

  return (
    <section class="home-block" aria-label="Production status">
      <HomeBlockTitle right={data()?.stale ? copy().cached : (stats().total ? `${stats().up}/${stats().total} up` : undefined)}>production / status</HomeBlockTitle>
      <Show when={err() && !data()} fallback={
        <Show when={data()} fallback={<div class="home-rows"><div class="home-row"><span class="home-row-value">{copy().waiting}</span></div></div>}>
          <div class="home-prod">
            <ProdGroupRows groups={groups} />
          </div>
        </Show>
      }>
        <div class="home-rows home-rows-error">
          <div class="home-row"><span class="home-row-label">{copy().unreachable}</span></div>
        </div>
      </Show>
    </section>
  )
}

// ── Page ───────────────────────────────────────────────────────

export function HomePage(props: { lang: Lang; navigate: HomeNavigate }) {
  const introHtml = () => renderSimpleMarkdown(getPageMarkdown(props.lang, 'main'))

  return (
    <div class="home-page">
      <div class="home-intro markdown-content" innerHTML={introHtml()} />
      <div class="home-grid">
        <SystemBlock lang={props.lang} />
        <NowPlayingBlock lang={props.lang} navigate={props.navigate} />
        <ActivityBlock lang={props.lang} navigate={props.navigate} />
        <FeedBlock lang={props.lang} navigate={props.navigate} />
        <DiscographyBlock lang={props.lang} navigate={props.navigate} />
        <DotfilesBlock />
        <ProductionStatusBlock lang={props.lang} />
        <div class="home-rms-easter">
          <LazyMedia src="/media/image/richard-stollman-unix-linux.gif" alt="richard stallman — unix / linux" width={320} height={284} unloadDelay={10000} margin={300} />
          <LazyMedia src="/media/image/tole-tole-mei-mei.gif" alt="tole tole mei mei" width={320} height={320} unloadDelay={10000} margin={300} />
          <LazyMedia src="/media/image/000185.gif" alt="mem" width={240} height={240} unloadDelay={10000} margin={300} />
          <LazyMedia src="/media/image/15198198061100390250.gif" alt="boom" width={240} height={302} unloadDelay={10000} margin={300} />
          <LazyMedia src="/media/image/animation.gif" alt="animation" width={240} height={180} unloadDelay={10000} margin={300} />
          <LazyMedia src="/media/image/animation-other.gif" alt="animation" width={240} height={196} unloadDelay={10000} margin={300} />
          <LazyMedia src="/media/image/bunny-fall.gif" alt="bunny fall" width={240} height={240} unloadDelay={10000} margin={300} />
          <LazyMedia src="/media/image/crazy.gif" alt="crazy" width={240} height={183} unloadDelay={10000} margin={300} />
          <LazyMedia src="/media/image/doc-2026-09-14.gif" alt="doc" width={240} height={230} unloadDelay={10000} margin={300} />
          <LazyMedia src="/media/image/gballs.gif" alt="g balls" width={240} height={240} unloadDelay={10000} margin={300} />
          <LazyMedia src="/media/image/gun-shot.gif" alt="gun shot" width={240} height={237} unloadDelay={10000} margin={300} />
          <LazyMedia src="/media/image/iekaca-gif.gif" alt="iekaca" width={240} height={120} unloadDelay={10000} margin={300} />
          <LazyMedia src="/media/image/spamton-plush.gif" alt="spamton plush" width={240} height={156} unloadDelay={10000} margin={300} />
          <LazyMedia src="/media/image/video.gif" alt="video" width={240} height={135} unloadDelay={10000} margin={300} />
        </div>
      </div>
    </div>
  )
}