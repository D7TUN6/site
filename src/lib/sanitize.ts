import DOMPurify from 'dompurify'

const ALLOWED_TAGS = ['a', 'b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'sub', 'sup', 'u', 's', 'span', 'div', 'img', 'figure', 'figcaption', 'audio', 'video', 'source', 'track']

export function sanitizeHtml(html: string): string {
  if (typeof window === 'undefined' || typeof DOMPurify?.sanitize !== 'function') return html
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ADD_ATTR: ['target', 'rel', 'src', 'alt', 'href', 'class', 'id', 'controls', 'preload', 'playsinline', 'poster', 'type', 'loop', 'muted'] })
}
