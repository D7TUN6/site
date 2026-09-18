export type AdminLocalizedText = { en: string; ru: string }
export type AdminThanksCard = {
  id: string
  name: string
  role: AdminLocalizedText
  text: AdminLocalizedText
  avatar: string
  url: string
}
export type AdminWebringSite = {
  id: string
  name: string
  url: string
  badge: string
  owner: string
}
export type AdminSpecial = {
  bio: AdminLocalizedText
  thanks: AdminThanksCard[]
  webring: AdminWebringSite[]
  bannerHtml: string
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

export async function getAdminSpecial(): Promise<AdminSpecial> {
  const data = await api<{ ok: boolean; special: AdminSpecial }>('/api/admin/special')
  return data.special
}

export async function updateAdminSpecial(special: AdminSpecial): Promise<AdminSpecial> {
  const data = await api<{ ok: boolean; special: AdminSpecial }>('/api/admin/special', {
    method: 'PUT',
    body: JSON.stringify({ special }),
  })
  return data.special
}
