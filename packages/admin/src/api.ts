const API = import.meta.env.VITE_API_URL || '/api/admin'

function getToken(): string | null {
  return sessionStorage.getItem('admin_token')
}

function setToken(token: string) {
  sessionStorage.setItem('admin_token', token)
}

function clearToken() {
  sessionStorage.removeItem('admin_token')
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {})
  const token = getToken()
  if (token) headers.set('authorization', `Bearer ${token}`)
  if (!headers.has('content-type') && init.body && !(init.body instanceof FormData)) {
    headers.set('content-type', 'application/json')
  }

  const resp = await fetch(`${API}${path}`, {
    ...init,
    headers,
  })

  const data = await resp.json()
  if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`)
  return data
}

interface ApiResponse<T = unknown> {
  ok: boolean
  error?: string
  token?: string
  isAdmin?: boolean
  email?: string | null
  slug?: string
  files?: string[]
  entries?: T[]
  [key: string]: unknown
}

export const api = {
  login: async (email: string, password: string) => {
    const data = await request<ApiResponse<unknown>>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    if (data.token) setToken(data.token)
    return data
  },

  logout: () => {
    clearToken()
    return request<ApiResponse>('/auth/logout', { method: 'POST' })
  },

  me: () => request<{ ok: boolean; isAdmin: boolean; email: string | null }>('/auth/me'),

  releases: {
    list: () => request<ApiResponse>('/releases'),
    create: (formData: FormData) => request<ApiResponse>('/releases', { method: 'POST', body: formData }),
    update: (slug: string, data: unknown) => request<ApiResponse>(`/releases/${slug}`, { method: 'PATCH', body: JSON.stringify(data) }),
    del: (slug: string) => request<ApiResponse>(`/releases/${slug}`, { method: 'DELETE' }),
  },

  gallery: {
    list: () => request<ApiResponse>('/gallery'),
    create: (data: unknown) => request<ApiResponse>('/gallery', { method: 'POST', body: JSON.stringify(data) }),
    update: (slug: string, data: unknown) => request<ApiResponse>(`/gallery/${slug}`, { method: 'PATCH', body: JSON.stringify(data) }),
    uploadImages: (slug: string, formData: FormData) => request<ApiResponse>(`/gallery/${slug}/images`, { method: 'POST', body: formData }),
    del: (slug: string) => request<ApiResponse>(`/gallery/${slug}`, { method: 'DELETE' }),
  },

  video: {
    list: () => request<ApiResponse>('/video'),
    create: (data: unknown) => request<ApiResponse>('/video', { method: 'POST', body: JSON.stringify(data) }),
    upload: (slug: string, formData: FormData) => request<ApiResponse>(`/video/${slug}/upload`, { method: 'POST', body: formData }),
    update: (slug: string, data: unknown) => request<ApiResponse>(`/video/${slug}`, { method: 'PATCH', body: JSON.stringify(data) }),
    del: (slug: string) => request<ApiResponse>(`/video/${slug}`, { method: 'DELETE' }),
  },

  shop: {
    list: () => request<ApiResponse>('/shop'),
    create: (data: unknown) => request<ApiResponse>('/shop', { method: 'POST', body: JSON.stringify(data) }),
    update: (slug: string, data: unknown) => request<ApiResponse>(`/shop/${slug}`, { method: 'PATCH', body: JSON.stringify(data) }),
    uploadImages: (slug: string, formData: FormData) => request<ApiResponse>(`/shop/${slug}/images`, { method: 'POST', body: formData }),
    del: (slug: string) => request<ApiResponse>(`/shop/${slug}`, { method: 'DELETE' }),
  },

  radio: {
    get: () => request<ApiResponse>('/radio'),
    schedule: (schedule: unknown[]) => request<ApiResponse>('/radio/schedule', { method: 'POST', body: JSON.stringify({ schedule }) }),
    regenerate: () => request<ApiResponse>('/radio/regenerate-stream', { method: 'POST' }),
  },

  config: {
    get: () => request<ApiResponse>('/site-config'),
    update: (config: Record<string, unknown>) => request<ApiResponse>('/site-config', { method: 'POST', body: JSON.stringify({ config }) }),
  },

  banners: {
    list: () => request<ApiResponse>('/banners'),
    create: (data: unknown) => request<ApiResponse>('/banners', { method: 'POST', body: JSON.stringify(data) }),
    del: (id: string) => request<ApiResponse>(`/banners/${id}`, { method: 'DELETE' }),
  },

  content: {
    pages: {
      list: () => request<{ ok: boolean; en: string[]; ru: string[] }>('/content/pages'),
      get: (pageKey: string) => request<{ ok: boolean; en: { content: string } | null; ru: { content: string } | null }>(`/content/pages/${pageKey}`),
      update: (pageKey: string, data: { en?: { content: string }; ru?: { content: string } }) => request<{ ok: boolean }>(`/content/pages/${pageKey}`, { method: 'PUT', body: JSON.stringify(data) }),
    },
    news: {
      list: () => request<ApiResponse>('/content/news'),
      create: (data: unknown) => request<ApiResponse>('/content/news', { method: 'POST', body: JSON.stringify(data) }),
      update: (slug: string, data: unknown) => request<ApiResponse>(`/content/news/${slug}`, { method: 'PUT', body: JSON.stringify(data) }),
      del: (slug: string) => request<ApiResponse>(`/content/news/${slug}`, { method: 'DELETE' }),
    },
    blog: {
      list: () => request<ApiResponse>('/content/blog'),
      create: (data: unknown) => request<ApiResponse>('/content/blog', { method: 'POST', body: JSON.stringify(data) }),
      update: (slug: string, data: unknown) => request<ApiResponse>(`/content/blog/${slug}`, { method: 'PUT', body: JSON.stringify(data) }),
      del: (slug: string) => request<ApiResponse>(`/content/blog/${slug}`, { method: 'DELETE' }),
    },
  },
}
