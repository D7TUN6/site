import type { Elysia } from 'elysia'
import { originBase, jsonHandler } from './json-handler.js'
import { getJwks, buildDirectorySignature, isBotAuthReady } from '../bot-auth.js'

function oauthConfig() {
  const base = originBase()
  return {
    issuer: base,
    authorization_endpoint: `${base}/api/auth/login`,
    token_endpoint: `${base}/api/auth/login`,
    jwks_uri: `${base}/.well-known/http-message-signatures-directory`,
    registration_endpoint: `${base}/api/auth/register`,
    scopes_supported: ['openid', 'email', 'profile'],
    response_types_supported: ['token', 'id_token'],
    grant_types_supported: [
      'password',
      'authorization_code',
      'refresh_token',
      'urn:ietf:params:oauth:grant-type:jwt-bearer',
      'urn:workos:agent-auth:grant-type:claim',
    ],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
    revocation_endpoint: `${base}/api/auth/logout`,
    service_documentation: `${base}/`,
    ui_locales_supported: ['ru', 'en'],
    agent_auth: {
      skill: `${base}/auth.md`,
      register_uri: `${base}/api/auth/register`,
      identity_endpoint: `${base}/api/auth/register`,
      claim_endpoint: `${base}/agent/identity/claim`,
      identity_types_supported: ['identity_assertion', 'anonymous'],
      identity_assertion: {
        assertion_types_supported: ['verified_email'],
        credential_types_supported: ['urn:ietf:params:oauth:token-type:access_token'],
        claim_uri: `${base}/agent/identity/claim`,
      },
      anonymous: {
        credential_types_supported: ['urn:ietf:params:oauth:token-type:access_token'],
        claim_uri: `${base}/agent/identity/claim`,
      },
    },
  }
}

function openIdConfig() {
  const base = originBase()
  return {
    issuer: base,
    authorization_endpoint: `${base}/api/auth/login`,
    token_endpoint: `${base}/api/auth/login`,
    jwks_uri: `${base}/.well-known/http-message-signatures-directory`,
    registration_endpoint: `${base}/api/auth/register`,
    scopes_supported: ['openid', 'email', 'profile'],
    response_types_supported: ['password', 'authorization_code', 'refresh_token'],
    subject_types_supported: ['pairwise', 'public'],
    id_token_signing_alg_values_supported: ['EdDSA', 'RS256'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
    claims_supported: ['sub', 'iss', 'email', 'email_verified', 'iat', 'exp'],
    revocation_endpoint: `${base}/api/auth/logout`,
    service_documentation: `${base}/`,
    ui_locales_supported: ['ru', 'en'],
  }
}

function protectedResourceConfig() {
  const base = originBase()
  return {
    resource: `${base}/`,
    resource_name: 'D7TUN6',
    authorization_servers: [base],
    scopes_supported: ['openid', 'email', 'profile'],
    bearer_methods_supported: ['header'],
  }
}

export function addAuthConfigRoutes(app: Elysia) {
  return app
    .get('/http-message-signatures-directory', ({ request, set }) => {
      if (!isBotAuthReady()) {
        set.status = 404
        return { error: 'Bot auth not configured' }
      }
      const authority = request.headers.get('host') || 'unknown'
      const { signature, signatureInput } = buildDirectorySignature(authority)
      const jwks = getJwks()
      set.headers['content-type'] = 'application/http-message-signatures-directory+json'
      set.headers['signature'] = signature
      set.headers['signature-input'] = signatureInput
      set.headers['cache-control'] = 'max-age=86400'
      return jwks
    })
    .get('/oauth-authorization-server', jsonHandler(oauthConfig(), 86400))
    .get('/openid-configuration', jsonHandler(openIdConfig(), 86400))
    .get('/oauth-protected-resource', jsonHandler(protectedResourceConfig(), 86400))
}
