export type SessionUser = {
  id: number
  email: string
  role: 'admin' | 'user'
}

export type AuthState = {
  authenticated: boolean
  user: SessionUser | null
}

export type LoginPayload = {
  email: string
  password: string
}

export type RegisterPayload = {
  email: string
  password: string
  name?: string
}
