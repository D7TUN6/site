export function parseMdx(source: string): { frontmatter: Record<string, string>; body: string } {
  const normalized = source.replace(/^\uFEFF/, '')
  if (!normalized.startsWith('---\n')) return { frontmatter: {}, body: normalized.trim() }
  const endIndex = normalized.indexOf('\n---\n', 4)
  if (endIndex === -1) return { frontmatter: {}, body: normalized.trim() }
  const raw = normalized.slice(4, endIndex)
  const body = normalized.slice(endIndex + 5).trim()
  const frontmatter: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const sep = line.indexOf(':')
    if (sep === -1) continue
    const key = line.slice(0, sep).trim()
    const value = line.slice(sep + 1).trim().replace(/^['"]|['"]$/g, '')
    if (key) frontmatter[key] = value
  }
  return { frontmatter, body }
}

export function parseFrontmatter(raw: string): Record<string, unknown> {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/)
  if (!match) return {}
  const body = match[1]
  const attrs: Record<string, unknown> = {}
  const lines = body.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*-/.test(line)) continue
    const sep = line.indexOf(':')
    if (sep === -1) continue
    const key = line.slice(0, sep).trim()
    const rawVal: string = line.slice(sep + 1).trim()
    if (key === 'sources' && !rawVal) {
      const sources: Array<Record<string, string>> = []
      let current: Record<string, string> | null = null
      i++
      while (i < lines.length && /^\s+\S/.test(lines[i])) {
        const l = lines[i].trim()
        if (l.startsWith('- ')) {
          if (current) sources.push(current)
          current = {}
          const rest = l.slice(2)
          for (const part of rest.split(',')) {
            const [k, ...v] = part.split(':')
            if (k && v.length) current[k.trim()] = v.join(':').trim()
          }
        } else if (current && l.includes(':')) {
          const [k, ...v] = l.split(':')
          current[k.trim()] = v.join(':').trim()
        }
        i++
      }
      if (current) sources.push(current)
      if (sources.length) attrs.sources = sources
      continue
    }
    let val: unknown = rawVal.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n')
    if (rawVal === 'true') val = true
    else if (rawVal === 'false') val = false
    else if (/^\d+$/.test(rawVal)) val = Number(rawVal)
    else if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
      val = rawVal.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
    }
    attrs[key] = val
  }
  return attrs
}

export function serializeMdx(frontmatter: Record<string, string>, body: string): string {
  const fm = Object.entries(frontmatter)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')
  return `---\n${fm}\n---\n\n${body.trim()}\n`
}
