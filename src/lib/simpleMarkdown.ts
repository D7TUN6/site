import { sanitizeHtml } from './sanitize'

export type MarkdownRenderOptions = {
  openLinksInNewTab?: boolean
}

function slugifyId(text: string): string {
  const base = text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^a-z0-9\u0400-\u04FF]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return base || `h-${Math.random().toString(36).slice(2, 7)}`
}

function inline(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[(.+?)\]\((.+?)\)/g, (_m, text, url) => {
      const ext = url.startsWith('http') ? ' target="_blank" rel="noopener noreferrer"' : ''
      return `<a href="${escapeHtml(url)}"${ext}>${text}</a>`
    })
}

export function renderSimpleMarkdown(source: string, options: MarkdownRenderOptions = {}): string {
  const lines = source.split(/\r?\n/)
  const out: string[] = []
  let inList = false
  let inHtmlBlock = false
  let inQuote = false
  let fence: { lang: string; body: string[] } | null = null

  const flushList = () => { if (inList) { out.push('</ul>'); inList = false } }
  const flushQuote = () => { if (inQuote) { out.push('</blockquote>'); inQuote = false } }
  const flushAll = () => { flushList(); flushQuote() }

  const pushFence = (fence: { lang: string; body: string[] }) => {
    const lang = fence.lang.trim().replace(/[^a-zA-Z0-9+#-]/g, '')
    const body = fence.body.join('\n').replace(/\s+$/g, '')
    out.push(
      `<pre class="code-block">` +
      (lang ? `<div class="code-head">[${escapeHtml(lang)}]</div>` : '') +
      `<code>${escapeHtml(body)}</code>` +
      `</pre>`
    )
  }

  for (const raw of lines) {
    if (fence) {
      if (/^\s*```/.test(raw)) {
        pushFence(fence)
        fence = null
      } else {
        fence.body.push(raw)
      }
      continue
    }

    const line = raw.trim()

    if (/^\s*```/.test(raw)) {
      flushAll()
      fence = { lang: raw.replace(/^\s*```\s*/, ''), body: [] }
      continue
    }

    if (!line) {
      flushList()
      if (inHtmlBlock) out.push('')
      if (inQuote) { inQuote = false }
      continue
    }

    if (/^<[a-z/]/i.test(line)) {
      flushAll()
      out.push(raw)
      if (line.startsWith('</')) inHtmlBlock = false
      else if (!line.endsWith('/>')) inHtmlBlock = true
      continue
    }

    if (inHtmlBlock) {
      out.push(raw)
      if (line.startsWith('</')) inHtmlBlock = false
      continue
    }

    if (line.startsWith('#### ')) { flushAll(); out.push(`<h4 id="${slugifyId(line.slice(5))}">${inline(line.slice(5))}</h4>`); continue }
    if (line.startsWith('### ')) { flushAll(); out.push(`<h3 id="${slugifyId(line.slice(4))}">${inline(line.slice(4))}</h3>`); continue }
    if (line.startsWith('## ')) { flushAll(); out.push(`<h2 id="${slugifyId(line.slice(3))}">${inline(line.slice(3))}</h2>`); continue }
    if (line.startsWith('# ')) { flushAll(); out.push(`<h1>${inline(line.slice(2))}</h1>`); continue }
    if (line.startsWith('> ')) {
      flushList()
      if (!inQuote) { out.push('<blockquote>'); inQuote = true }
      else out.push('<br />')
      out.push(`<p>${inline(line.slice(2))}</p>`)
      continue
    }
    if (line.startsWith('- ')) {
      flushQuote()
      if (!inList) { out.push('<ul>'); inList = true }
      out.push(`<li>${inline(line.slice(2))}</li>`)
      continue
    }
    flushAll()
    out.push(`<p>${inline(line)}</p>`)
  }
  flushAll()
  if (fence) pushFence(fence)
  const html = sanitizeHtml(out.join('\n'))
  if (!options.openLinksInNewTab) return html
  return html.replace(/<a\b([^>]*)>/gi, (whole, attrs: string) => {
    if (!/\bhref=/i.test(attrs) || /\btarget=/i.test(attrs)) return whole
    return `<a ${attrs.trim()} target="_blank" rel="noopener noreferrer">`
  })
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}