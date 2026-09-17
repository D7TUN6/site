import TurndownService from 'turndown'

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  bulletListMarker: '-',
})

turndown.addRule('removeHidden', {
  filter: (node) => {
    if (node.nodeType === 1) {
      const el = node as HTMLElement
      const style = el.getAttribute('style') || ''
      const className = el.getAttribute('class') || ''
      if (style.includes('display:none') || style.includes('display: none')) return true
      if (className.includes('hidden') || className.includes('sr-only')) return true
    }
    return false
  },
  replacement: () => '',
})

turndown.addRule('removeScripts', {
  filter: ['script', 'style', 'noscript'],
  replacement: () => '',
})

turndown.addRule('removeNav', {
  filter: (node) => {
    if (node.nodeType === 1) {
      const el = node as HTMLElement
      if (el.tagName === 'NAV') return true
      if (el.tagName === 'HEADER' && !el.querySelector('h1, h2, h3')) return true
      if (el.tagName === 'FOOTER') return true
    }
    return false
  },
  replacement: () => '',
})

export function htmlToMarkdown(html: string): string {
  return turndown.turndown(html).trim()
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}
