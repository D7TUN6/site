import { apiFetchJson } from '@/lib/api/http'

export type ArtistSummary = {
  id: number
  name: string
  slug: string
  avatar_url: string
  bio: string
  verified: number
  status?: string
}

export type ArtistApplication = {
  id: number
  userId: number
  name: string
  bio: string
  links: string
  status: 'pending' | 'approved' | 'rejected' | 'sent_back'
  feedback: string
  createdAt: number
}

export type ArtistContentItem = {
  id: number
  artistId: number
  title: string
  description: string
  fileUrl: string
  thumbnailUrl: string
  type: string
  status: 'pending' | 'approved' | 'rejected'
  feedback: string
  createdAt: number
}

export function getArtists() {
  return apiFetchJson<{ ok: boolean; artists: ArtistSummary[] }>('/api/artists')
}

export function getMyArtist() {
  return apiFetchJson<{ ok: boolean; artist: ArtistSummary | null }>('/api/artists/me')
}

export function applyArtist(data: { name: string; bio: string; links: string }) {
  return apiFetchJson<{ ok: boolean; application: ArtistApplication }>('/api/artists/apply', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function getMyArtistApplication() {
  return apiFetchJson<{ ok: boolean; application: ArtistApplication | null }>('/api/artists/application')
}

export function getMyArtistContent() {
  return apiFetchJson<{ ok: boolean; items: ArtistContentItem[] }>('/api/artists/content')
}
