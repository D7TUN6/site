import { createEffect, createSignal, For, Show, onCleanup, onMount } from 'solid-js'
import type { Lang } from '@/types/content'

type LinkRow = { tag: string; label: string; url: string; note: string }
type LinkDir = { path: string; name: string; rows: LinkRow[] }

function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, '')
}

function buildDirs(lang: Lang): LinkDir[] {
  const names = lang === 'ru'
    ? { music: 'музыка', community: 'сообщества', dev: 'dev' }
    : { music: 'music', community: 'community', dev: 'dev' }
  return [
    {
      path: '~/links/music',
      name: names.music,
      rows: [
        { tag: 'BC', label: 'bandcamp', url: 'https://d7tun6.bandcamp.com', note: 'albums / merch / physical' },
        { tag: 'SC', label: 'soundcloud', url: 'https://soundcloud.com/d7tun6', note: 'demos / unreleased / idm' },
        { tag: 'SP', label: 'spotify', url: 'https://open.spotify.com/artist/3kxsK6GeWVOpm90RqqfYZy', note: 'streaming' },
        { tag: 'YM', label: 'yandex music', url: 'https://music.yandex.ru/artist/25225583', note: 'streaming' },
      ],
    },
    {
      path: '~/links/community',
      name: names.community,
      rows: [
        { tag: 'TG', label: 'telegram', url: 'https://t.me/d7tun6chnl', note: 'blog / thoughts / audio-notes' },
        { tag: 'YT', label: 'youtube', url: 'https://www.youtube.com/@D7TUN6', note: 'official artist channel / live' },
      ],
    },
    {
      path: '~/links/dev',
      name: names.dev,
      rows: [
        { tag: 'GH', label: 'github', url: 'https://github.com/D7TUN6', note: 'nixos / rust / dotfiles' },
      ],
    },
  ]
}

function dirContentMax(dir: LinkDir): number {
  return Math.max(
    ...dir.rows.map((r) => `[${r.tag}] ${r.label}`.length + 4 + displayUrl(r.url).length + 3 + r.note.length + 2)
  )
}

function dirHead(dir: LinkDir): string {
  const totalW = dirContentMax(dir) + 4
  const fill = Math.max(totalW - (9 + dir.path.length), 1)
  return `+---[ ${dir.path} ]` + '-'.repeat(fill) + '+'
}

function dirFoot(dir: LinkDir): string {
  return '+' + '-'.repeat(dirContentMax(dir) + 2) + '+'
}

type OutLine =
  | { key: string; kind: 'tree' | 'head' | 'foot'; dir: LinkDir }
  | { key: string; kind: 'tree-summary' }
  | { key: string; kind: 'row'; dir: LinkDir; row: LinkRow }

let animationPlayed = false

export function LinksPage(props: { lang: Lang }) {
  const dirs = () => buildDirs(props.lang)
  const totalLinks = () => dirs().reduce((n, d) => n + d.rows.length, 0)
  const COMMAND = 'tree ~/links --details'

  // Flatten the whole terminal output (tree header, then each ascii box
  // line-by-line) into one ordered list so a single reveal counter can print
  // them like a real terminal.
  const flatLines = (): OutLine[] => {
    const out: OutLine[] = []
    for (const d of dirs()) out.push({ key: 'tree:' + d.path, kind: 'tree', dir: d })
    out.push({ key: 'tree-summary', kind: 'tree-summary' })
    for (const d of dirs()) {
      out.push({ key: 'head:' + d.path, kind: 'head', dir: d })
      for (const r of d.rows) out.push({ key: 'row:' + d.path + ':' + r.url, kind: 'row', dir: d, row: r })
      out.push({ key: 'foot:' + d.path, kind: 'foot', dir: d })
    }
    return out
  }

  const [cmdChars, setCmdChars] = createSignal(0)
  const [loading, setLoading] = createSignal(false)
  const [printing, setPrinting] = createSignal(false)
  const [revealed, setRevealed] = createSignal(0)
  const [dots, setDots] = createSignal(0)

  const doneTyping = () => cmdChars() >= COMMAND.length
  const allDone = () => revealed() >= flatLines().length
  const pad = (n: number) => ' '.repeat(n)
  const descMax = () => Math.max(...dirs().map((d) => d.name.length))

  // 1) type the command like a teletype
  createEffect(() => {
    if (cmdChars() >= COMMAND.length) return
    const iv = setInterval(() => setCmdChars((c) => Math.min(COMMAND.length, c + 1)), 45)
    onCleanup(() => clearInterval(iv))
  })

  // 2) pause → "loading…" dots → print output one line at a time
  createEffect(() => {
    if (cmdChars() < COMMAND.length) return
    if (!loading()) {
      const to = setTimeout(() => setLoading(true), 900)
      onCleanup(() => clearTimeout(to))
      return
    }
    if (!printing()) {
      const to = setTimeout(() => setPrinting(true), 650)
      onCleanup(() => clearTimeout(to))
      return
    }
    if (revealed() >= flatLines().length) return
    const iv = setInterval(() => setRevealed((n) => (n >= flatLines().length ? n : n + 1)), 140)
    onCleanup(() => clearInterval(iv))
  })

  // animated "loading…" dots while waiting
  createEffect(() => {
    if (!loading() || printing()) return
    const iv = setInterval(() => setDots((d) => (d % 3) + 1), 240)
    onCleanup(() => clearInterval(iv))
  })

  onMount(() => {
    if (animationPlayed || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setCmdChars(COMMAND.length)
      setLoading(true)
      setPrinting(true)
      setRevealed(flatLines().length)
      return
    }
    animationPlayed = true
  })

  const renderLine = (line: OutLine) => {
    if (line.kind === 'tree' && line.dir) {
      const idx = dirs().findIndex((d) => d.path === line.dir!.path)
      const glyph = idx === dirs().length - 1 ? '└──' : '├──'
      const name = line.dir.name + pad(descMax() - line.dir.name.length)
      return (
        <div class="links-line">
          <span class="links-row-literal">{`${glyph} ${name} `}</span>
          <span class="links-tree-count">{`[${line.dir.rows.length} ${line.dir.rows.length === 1 ? 'link' : 'links'}]`}</span>
        </div>
      )
    }
    if (line.kind === 'tree-summary') {
      return (
        <div class="links-line links-row-literal">
          {`${dirs().length} ${dirs().length === 1 ? 'directory' : 'directories'}, ${totalLinks()} ${totalLinks() === 1 ? 'link' : 'links'}`}
        </div>
      )
    }
    if (line.kind === 'head' && line.dir) {
      return <div class="links-line links-head">{dirHead(line.dir)}</div>
    }
    if (line.kind === 'foot' && line.dir) {
      return <div class="links-line links-foot">{dirFoot(line.dir)}</div>
    }
    if (line.kind === 'row' && line.dir && line.row) {
      const url = displayUrl(line.row.url)
      const left = `[${line.row.tag}] ${line.row.label}`
      const max = dirContentMax(line.dir)
      const padRight = Math.max(max - (left.length + 4 + url.length + 3 + line.row.note.length + 2), 0)
      return (
        <div class="links-line links-row">
          <span class="links-row-literal">{`| ${left} -> `}</span>
          <a class="links-url" href={line.row.url} target="_blank" rel="noreferrer noopener">{url}</a>
          <span class="links-row-literal">{`   [${line.row.note}]`}{' '.repeat(padRight)}{' |'}</span>
        </div>
      )
    }
    return null
  }

  return (
    <div class="links-page">
      <div class="links-module">
        <div class="links-term">
        <div class="links-cmd" aria-live="polite">
          <span class="links-prompt">$</span><span>{COMMAND.slice(0, cmdChars())}</span>
          <Show when={!doneTyping()}>
            <span class="links-cursor" aria-hidden="true">&#9608;</span>
          </Show>
        </div>

        <Show when={loading() && !printing()}>
          <div class="links-loading">
            {props.lang === 'ru' ? 'загрузка' : 'loading'}<span class="links-loading-dots">{'.'.repeat(dots())}</span>
          </div>
        </Show>

        <Show when={revealed() > 0}>
          <div class="links-output">
            <For each={flatLines()}>
              {(line, i) => (
                <Show when={i() < revealed()}>
                  {renderLine(line)}
                </Show>
              )}
            </For>
          </div>
        </Show>

        <Show when={allDone()}>
          <div class="links-cmd links-cmd-idle">
            <span class="links-prompt">$</span><span class="links-cursor" aria-hidden="true">&#9608;</span>
          </div>
        </Show>
        </div>
      </div>
    </div>
  )
}