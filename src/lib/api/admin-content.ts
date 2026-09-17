export interface AdminContentArticle {
  slug: string
  title: string
  excerpt: string
  publishedAt: string
  content: string
}

async function api<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string })?.error || `Request failed: ${res.status}`)
  }
  return res.json() as Promise<T>
}

export async function getAdminContentList(type: 'news' | 'blog'): Promise<{ en: AdminContentArticle[]; ru: AdminContentArticle[] }> {
  const data = await api<{ en: AdminContentArticle[]; ru: AdminContentArticle[] }>(`/api/admin/content/${type}`)
  return { en: data.en ?? [], ru: data.ru ?? [] }
}

export async function getAdminContentArticle(type: 'news' | 'blog', slug: string): Promise<{ en: AdminContentArticle | null; ru: AdminContentArticle | null }> {
  const data = await api<{ en: AdminContentArticle | null; ru: AdminContentArticle | null }>(`/api/admin/content/${type}/${encodeURIComponent(slug)}`)
  return { en: data.en ?? null, ru: data.ru ?? null }
}

export async function createAdminContentArticle(
  type: 'news' | 'blog',
  data: { en?: Partial<AdminContentArticle> & { slug: string; title: string }; ru?: Partial<AdminContentArticle> & { slug: string; title: string } }
): Promise<{ ok: boolean; slug: string }> {
  return api<{ ok: boolean; slug: string }>(`/api/admin/content/${type}`, { method: 'POST', body: JSON.stringify(data) })
}

export async function updateAdminContentArticle(
  type: 'news' | 'blog',
  slug: string,
  data: { en?: Partial<AdminContentArticle>; ru?: Partial<AdminContentArticle> }
): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/admin/content/${type}/${encodeURIComponent(slug)}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function deleteAdminContentArticle(type: 'news' | 'blog', slug: string): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/admin/content/${type}/${encodeURIComponent(slug)}`, { method: 'DELETE' })
}

export async function getAdminContentPage(pageKey: string): Promise<{ en: { content: string } | null; ru: { content: string } | null }> {
  const data = await api<{ en: { content: string } | null; ru: { content: string } | null }>(`/api/admin/content/pages/${encodeURIComponent(pageKey)}`)
  return { en: data.en ?? null, ru: data.ru ?? null }
}

export async function updateAdminContentPage(pageKey: string, data: { en?: { content: string }; ru?: { content: string } }): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/admin/content/pages/${encodeURIComponent(pageKey)}`, { method: 'PUT', body: JSON.stringify(data) })
}
