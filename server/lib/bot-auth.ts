import crypto from 'node:crypto'

let _jwks: { keys: Array<Record<string, string>> } | null = null
let _thumbprint: string | null = null
let _privateKey: crypto.KeyObject | null = null

function base64Url(buf: Buffer): string {
  return buf.toString('base64url')
}

export function initBotAuth(pemBase64: string) {
  const pem = Buffer.from(pemBase64, 'base64').toString('utf-8')
  _privateKey = crypto.createPrivateKey({ key: pem, format: 'pem' })

  const pubJwk = crypto.createPublicKey(_privateKey).export({ format: 'jwk' })
  const canonical = JSON.stringify({ crv: pubJwk.crv, kty: pubJwk.kty, x: pubJwk.x })
  _thumbprint = base64Url(crypto.createHash('sha256').update(canonical).digest())

  _jwks = {
    keys: [
      {
        kty: pubJwk.kty!,
        crv: pubJwk.crv!,
        x: pubJwk.x!,
      },
    ],
  }
}

export function isBotAuthReady(): boolean {
  return _jwks !== null
}

export function getJwks(): { keys: Array<Record<string, string>> } {
  if (!_jwks) throw new Error('bot-auth not initialized')
  return _jwks
}

function getThumbprint(): string {
  if (!_thumbprint) throw new Error('bot-auth not initialized')
  return _thumbprint
}

/**
 * Build the signature base for RFC 9421 given covered components and params.
 *
 * The signature base is a series of lines:
 *   "component-id": component-value
 *   ...
 *   "@signature-params": (covered-components-list);key=val;...
 */
function buildSignatureBase(
  authority: string,
  alg: string,
  keyid: string,
  created: number,
  expires: number,
  nonce: string,
  tag: string,
): string {
  const covered = '("@authority";req)'
  const componentLine = `"@authority";req: ${authority.toLowerCase()}`
  const paramsLine = `@signature-params: ${covered};alg="${alg}";keyid="${keyid}";tag="${tag}";created=${created};expires=${expires};nonce="${nonce}"`
  return `${componentLine}\n${paramsLine}`
}

function signBase(base: string): string {
  if (!_privateKey) throw new Error('bot-auth not initialized')
  return base64Url(crypto.sign(null, Buffer.from(base, 'utf-8'), _privateKey))
}

export function buildDirectorySignature(authority: string): {
  signature: string
  signatureInput: string
  nonce: string
  created: number
  expires: number
} {
  const now = Math.floor(Date.now() / 1000)
  const created = now
  const expires = now + 86400
  const nonce = base64Url(crypto.randomBytes(32))
  const thumbprint = getThumbprint()

  const base = buildSignatureBase(authority, 'ed25519', thumbprint, created, expires, nonce, 'http-message-signatures-directory')
  const sig = signBase(base)

  const covered = '("@authority";req)'
  const signatureInput = `sig1=${covered};alg="ed25519";keyid="${thumbprint}";tag="http-message-signatures-directory";created=${created};expires=${expires};nonce="${nonce}"`
  const signature = `sig1=:${sig}:`

  return { signature, signatureInput, nonce, created, expires }
}
