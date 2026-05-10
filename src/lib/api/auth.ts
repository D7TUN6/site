import type { AuthState, LoginPayload, RegisterPayload } from '@/types/auth'
import { apiFetchJson } from '@/lib/api/http'

export function getSession() {
  return apiFetchJson<AuthState>('/api/auth/session')
}

export function login(payload: LoginPayload) {
  return apiFetchJson<AuthState>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function register(payload: RegisterPayload) {
  return apiFetchJson<AuthState>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function logout() {
  return apiFetchJson<{ ok: boolean }>('/api/auth/logout', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}
