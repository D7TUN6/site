// Native cursor images arrive via the CSS `--cursor-*` variables; the browser
// only ever picks the cursor of the element under the pointer. Text elements
// (p/h1/li/...) are full-width boxes, so a plain `cursor: text` on them would
// light up the I-beam across the whole row — including the empty right-hand
// margin. Instead we hit-test the pointer against the actual glyphs with
// caretRangeFromPoint/caretPositionFromPoint and flash the text cursor inline
// on whatever element sits under the pointer.

const INTERACTIVE_SELECTOR = [
  'a',
  'button',
  'select',
  'summary',
  'input',
  'textarea',
  'label',
  'details',
  'img',
  'video',
  'audio',
  '[contenteditable="true"]',
  '[contenteditable="plaintext-only"]',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="slider"]',
  '[role="switch"]',
  '[data-cursor="link-select"]',
  '[data-cursor="precision"]',
  '.cursor-link-select',
].join(',')

type CaretRangeFromPoint = (x: number, y: number) => Range | null
type CaretPositionFromPoint = (x: number, y: number) => { offsetNode: Node; offset: number } | null

type CaretDoc = Document & {
  caretRangeFromPoint?: CaretRangeFromPoint
  caretPositionFromPoint?: CaretPositionFromPoint
}

let activeEl: HTMLElement | null = null
let lastX = -1
let lastY = -1
let raf = 0
let running = false

function caretTextNode(x: number, y: number): { node: Text; offset: number } | null {
  try {
    const doc = document as CaretDoc
    const range = doc.caretRangeFromPoint ? doc.caretRangeFromPoint(x, y) : null
    const container = range?.startContainer
    if (container?.nodeType === Node.TEXT_NODE) {
      return { node: container as Text, offset: range?.startOffset ?? 0 }
    }
    const pos = doc.caretPositionFromPoint ? doc.caretPositionFromPoint(x, y) : null
    if (pos?.offsetNode?.nodeType === Node.TEXT_NODE) return { node: pos.offsetNode as Text, offset: pos.offset }
  } catch {
    // caret APIs can throw in odd edge cases — treat as “no text here”
  }
  return null
}

// caret*FromPoint snaps to the nearest caret even when the pointer is on empty
// page space (right of the last word, in the line gaps). Compare the pointer
// with the bounding box of the character right before the caret — if it isn't
// inside that glyph's box, the pointer isn't over text.
function overGlyph(x: number, y: number): boolean {
  const hit = caretTextNode(x, y)
  if (!hit) return false
  const { node, offset } = hit
  if (offset <= 0 || offset > node.data.length) return false
  try {
    const range = document.createRange()
    range.setStart(node, offset - 1)
    range.setEnd(node, offset)
    const rect = range.getBoundingClientRect()
    if (!rect || (rect.width === 0 && rect.height === 0)) return false
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
  } catch {
    return false
  }
}

function applyCursor(el: HTMLElement | null, text: boolean): void {
  if (activeEl && activeEl !== el) activeEl.style.cursor = ''
  activeEl = el
  if (el) el.style.cursor = text ? 'var(--cursor-text)' : ''
}

function evaluate(): void {
  raf = 0
  if (!running || lastX < 0 || lastY < 0) return
  const el = document.elementFromPoint(lastX, lastY)
  if (!el || el === document.documentElement || el === document.body) {
    applyCursor(null, false)
    return
  }
  const target = el as HTMLElement
  if (target.closest(INTERACTIVE_SELECTOR)) {
    // Links/buttons/etc. already paint their own cursor via CSS
    applyCursor(null, false)
    return
  }
  applyCursor(target, overGlyph(lastX, lastY))
}

function schedule(): void {
  if (running && !raf) raf = requestAnimationFrame(evaluate)
}

export function initCursorMode(): void {
  if (typeof window === 'undefined') return
  const probe = document as Document & Record<string, unknown>
  if (!('caretRangeFromPoint' in probe) && !('caretPositionFromPoint' in probe)) {
    // Ancient browsers without the caret APIs: fall back to the classic
    // full-box text cursor (see html.no-caret-api rule in base.css).
    document.documentElement.classList.add('no-caret-api')
    return
  }
  const canHover = !window.matchMedia || window.matchMedia('(pointer: fine)').matches || navigator.maxTouchPoints === 0
  if (!canHover) return

  running = true
  const onMove = (e: PointerEvent): void => {
    lastX = e.clientX
    lastY = e.clientY
    schedule()
  }
  const onLeave = (): void => applyCursor(null, false)
  const onScrollOrResize = (): void => schedule()

  window.addEventListener('pointermove', onMove, { passive: true })
  document.documentElement.addEventListener('pointerleave', onLeave)
  window.addEventListener('scroll', onScrollOrResize, { passive: true })
  window.addEventListener('resize', onScrollOrResize)
}