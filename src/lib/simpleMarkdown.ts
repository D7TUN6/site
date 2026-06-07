export function renderSimpleMarkdown(source: string): string {
  const lines = source.split(/\r?\n/)
  const out: string[] = []
  let inList = false
  let inHtmlBlock = false

  const flushList = () => { if (inList) { out.push('</ul>'); inList = false } }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      flushList()
      if (inHtmlBlock) out.push('')
      continue
    }

    if (line.startsWith('<')) {
      flushList()
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

    if (line.startsWith('### ')) { flushList(); out.push(`<h3>${escapeHtml(line.slice(4))}</h3>`); continue }
    if (line.startsWith('## ')) { flushList(); out.push(`<h2>${escapeHtml(line.slice(3))}</h2>`); continue }
    if (line.startsWith('# ')) { flushList(); out.push(`<h1>${escapeHtml(line.slice(2))}</h1>`); continue }
    if (line.startsWith('- ')) {
      if (!inList) { out.push('<ul>'); inList = true }
      out.push(`<li>${inline(line.slice(2))}</li>`)
      continue
    }
    flushList()
    out.push(`<p>${inline(line)}</p>`)
  }
  flushList()
  return out.join('\n')
}

function inline(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
