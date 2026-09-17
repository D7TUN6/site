import { apiFetchJson } from '@/lib/api/http'

export type BlogComment = {
  id: number
  parentId: number | null
  authorName: string
  content: string
  createdAt: number
  replies: BlogComment[]
}

export type CreateCommentPayload = {
  postSlug: string
  parentId?: number | null
  content: string
}

export function fetchComments(postSlug: string): Promise<{ ok: boolean; postSlug: string; comments: BlogComment[] }> {
  return apiFetchJson(`/api/comments/${encodeURIComponent(postSlug)}`)
}

export function submitComment(payload: CreateCommentPayload): Promise<{ ok: boolean; comment: BlogComment & { status: string } }> {
  return apiFetchJson('/api/comments', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function countComments(comments: BlogComment[]): number {
  return comments.reduce((n, c) => n + 1 + countComments(c.replies), 0)
}