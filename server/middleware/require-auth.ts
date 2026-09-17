type AuthGuardContext = {
  user?: unknown
  isAdmin?: unknown
  set: { status?: number | string }
}

export function requireUser({ user, set }: AuthGuardContext) {
  if (!user) {
    set.status = 401
    return { error: 'Unauthorized' }
  }
}

export function requireAdmin({ isAdmin, set }: AuthGuardContext) {
  if (!isAdmin) {
    set.status = 401
    return { error: 'Unauthorized' }
  }
}
