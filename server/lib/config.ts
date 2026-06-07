export function isProduction() {
  return process.env.NODE_ENV === 'production'
}

export function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

export function getOptionalEnv(name: string, fallback = '') {
  const value = process.env[name]
  return value ? String(value) : fallback
}

export function getAppSecret() {
  return requireEnv('APP_SECRET')
}

export function getAppOrigin() {
  return getOptionalEnv('APP_ORIGIN', '')
}
