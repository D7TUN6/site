export async function apiFetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {})
  if (!headers.has('Content-Type') && init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  // signal to enforceSameOrigin that this is a same-origin fetch request
  if (!headers.has('X-Requested-With')) {
    headers.set('X-Requested-With', 'fetch')
  }

  const response = await fetch(url, {
    credentials: 'include',
    ...init,
    headers,
  })

  const text = await response.text()
  const data = text.trim() ? JSON.parse(text) : null

  if (!response.ok) {
    const message = data?.error || `Request failed: ${response.status}`
    throw new Error(message)
  }

  return data as T
}
