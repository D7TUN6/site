export type WebkitDocument = Document & {
  webkitFullscreenElement?: Element | null
  webkitCurrentFullScreenElement?: Element | null
  webkitIsFullScreen?: boolean
  webkitExitFullscreen?: () => void
  webkitCancelFullScreen?: () => void
}

export type WebkitElement = HTMLElement & {
  webkitRequestFullscreen?: () => void
  webkitEnterFullscreen?: () => void
}

export type FullscreenFunc = () => Promise<void> | void

export function isFullscreen(doc: WebkitDocument): boolean {
  return !!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.webkitCurrentFullScreenElement || doc.webkitIsFullScreen)
}

export function requestFullscreen(el: WebkitElement): void {
  const req = (el.requestFullscreen ?? el.webkitRequestFullscreen ?? el.webkitEnterFullscreen) as FullscreenFunc | undefined
  if (!req) return
  const result = req.call(el) as Promise<void> | undefined
  result?.catch?.(() => {})
}

export function videoElementFullscreen(el: WebkitElement | null | undefined): boolean {
  if (!el?.webkitEnterFullscreen) return false
  el.webkitEnterFullscreen()
  return true
}

export function exitFullscreen(doc: WebkitDocument): void {
  const exit = (doc.exitFullscreen ?? doc.webkitExitFullscreen ?? doc.webkitCancelFullScreen) as FullscreenFunc | undefined
  if (!exit) return
  const result = exit.call(doc) as Promise<void> | undefined
  result?.catch?.(() => {})
}