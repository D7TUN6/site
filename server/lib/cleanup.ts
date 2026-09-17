const cleanups = new Set<() => void>()

export function registerCleanup(fn: () => void) {
  cleanups.add(fn)
  return fn
}

export function runCleanups() {
  for (const fn of cleanups) fn()
  cleanups.clear()
}
