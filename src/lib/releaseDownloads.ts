import type { ReleaseEntry } from '@/types/content'

type DownloadFormat = 'flac' | 'mp3' | 'ogg' | 'wav'

function parseDownloadFileName(contentDisposition: string | null, fallbackName: string): string {
  if (!contentDisposition) return fallbackName
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    try { return decodeURIComponent(utf8Match[1]) } catch { return utf8Match[1] }
  }
  const simpleMatch = contentDisposition.match(/filename="([^"]+)"/i)
  if (simpleMatch?.[1]) return simpleMatch[1]
  return fallbackName
}

function submitHiddenPost(action: string, payload: Record<string, string>) {
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = action
  form.style.display = 'none'
  for (const [key, value] of Object.entries(payload)) {
    const input = document.createElement('input')
    input.type = 'hidden'; input.name = key; input.value = value
    form.appendChild(input)
  }
  document.body.appendChild(form)
  form.submit()
  form.remove()
}

function isLikelyIOSDevice(): boolean {
  const ua = navigator.userAgent || ''
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export async function downloadRelease(release: ReleaseEntry, format: DownloadFormat) {
  const payload = { slug: release.slug, format }
  if (isLikelyIOSDevice()) return submitHiddenPost('/api/releases/download', payload)
  const response = await fetch('/api/releases/download', { method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', body: JSON.stringify(payload) })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string; message?: string } | null
    throw new Error(body?.error || body?.message || 'Download failed')
  }
  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = parseDownloadFileName(response.headers.get('content-disposition'), `${release.slug}-${format}.zip`)
  document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
}

export async function downloadTrack(release: ReleaseEntry, trackIndex: number, format: DownloadFormat) {
  const payload = { slug: release.slug, track: String(trackIndex), format }
  if (isLikelyIOSDevice()) return submitHiddenPost('/api/releases/track', payload)
  const response = await fetch('/api/releases/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', body: JSON.stringify(payload) })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string; message?: string } | null
    throw new Error(body?.error || body?.message || 'Track download failed')
  }
  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = parseDownloadFileName(response.headers.get('content-disposition'), `${release.slug}-${trackIndex}.${format}`)
  document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
}
