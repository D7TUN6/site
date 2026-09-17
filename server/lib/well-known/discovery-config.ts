import type { Elysia } from 'elysia'
import crypto from 'node:crypto'
import { originBase, jsonHandler } from './json-handler.js'

const sha256Hex = (content: string) =>
  crypto.createHash('sha256').update(content, 'utf-8').digest('hex')

function corsJsonHandler(data: object, maxAge = 3600) {
  const h = jsonHandler(data, maxAge)
  return ({ set }: { set: { headers: Record<string, unknown> } }) => {
    set.headers['access-control-allow-methods'] = 'GET'
    set.headers['access-control-allow-headers'] = 'Content-Type'
    return h({ set })
  }
}

function acpConfig() {
  const base = originBase()
  return {
    protocol: {
      name: 'acp',
      version: '2026-01-30',
      supported_versions: ['2025-09-29', '2025-12-12', '2026-01-16', '2026-01-30'],
      documentation_url: 'https://agenticcommerce.dev',
    },
    api_base_url: `${base}/api`,
    transports: ['rest'],
    capabilities: {
      services: ['checkout', 'orders', 'carts'],
      supported_currencies: ['rub', 'usd'],
      supported_locales: ['ru-RU', 'en-US'],
    },
  }
}

function mcpServerCard() {
  const base = originBase()
  const host = new URL(base).host
  return {
    name: `${host}/music-platform`,
    version: '1.0.0',
    description: 'D7TUN6 artist platform — music releases, gallery, video, radio, and content',
    title: 'D7TUN6',
    websiteUrl: base,
    serverInfo: {
      name: `${host}/music-platform`,
      version: '1.0.0',
    },
    remotes: [
      {
        type: 'streamable-http',
        url: `${base}/mcp`,
        supportedProtocolVersions: ['2025-03-26'],
      },
    ],
    capabilities: {
      tools: {
        'search-releases': {
          name: 'search-releases',
          description: 'Search music releases by query, year, or tag',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
              year: { type: 'number' },
              tag: { type: 'string', enum: ['LP', 'EP', 'Single', 'Remaster', 'Compilation', 'Demo', 'Live'] },
              limit: { type: 'number', default: 20 },
            },
          },
        },
        'get-release': {
          name: 'get-release',
          description: 'Get detailed info about a specific release by slug',
          inputSchema: {
            type: 'object',
            properties: { slug: { type: 'string' } },
            required: ['slug'],
          },
        },
        'list-gallery': {
          name: 'list-gallery',
          description: 'List gallery entries (photo albums)',
          inputSchema: {
            type: 'object',
            properties: { limit: { type: 'number', default: 50 } },
          },
        },
        'list-videos': {
          name: 'list-videos',
          description: 'List video entries',
          inputSchema: {
            type: 'object',
            properties: { limit: { type: 'number', default: 50 } },
          },
        },
        'get-radio-state': {
          name: 'get-radio-state',
          description: 'Get current radio stream state and track info',
          inputSchema: { type: 'object', properties: {} },
        },
        'get-site-config': {
          name: 'get-site-config',
          description: 'Get public site configuration',
          inputSchema: { type: 'object', properties: {} },
        },
        'get-content': {
          name: 'get-content',
          description: 'Browse CMS content (news, blog, pages)',
          inputSchema: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['news', 'blog'] },
              limit: { type: 'number', default: 20 },
            },
          },
        },
      },
      resources: {
        'robots-txt': { uri: '/robots.txt', mimeType: 'text/plain' },
        'sitemap': { uri: '/sitemap.xml', mimeType: 'application/xml' },
        'openapi': { uri: '/openapi.json', mimeType: 'application/json' },
        'agent-skills': { uri: '/.well-known/agent-skills/index.json', mimeType: 'application/json' },
      },
    },
  }
}

function ucpProfile() {
  const base = originBase()
  const ucpVersion = '2026-04-08'
  return {
    ucp: {
      version: ucpVersion,
      services: {
        'dev.ucp.shopping': [
          {
            version: ucpVersion,
            spec: `https://ucp.dev/${ucpVersion}/specification/overview/`,
            transport: 'rest',
            endpoint: `${base}/api`,
            schema: `https://ucp.dev/${ucpVersion}/services/shopping/rest.openapi.json`,
          },
        ],
      },
      capabilities: {
        'dev.ucp.shopping.catalog': [
          {
            version: ucpVersion,
            spec: `https://ucp.dev/${ucpVersion}/specification/catalog/`,
            schema: `https://ucp.dev/${ucpVersion}/specification/catalog/`,
          },
        ],
        'dev.ucp.shopping.checkout': [
          {
            version: ucpVersion,
            spec: `https://ucp.dev/${ucpVersion}/specification/checkout/`,
            schema: `https://ucp.dev/${ucpVersion}/schemas/shopping/checkout.json`,
          },
        ],
        'dev.ucp.shopping.order': [
          {
            version: ucpVersion,
            spec: `https://ucp.dev/${ucpVersion}/specification/order/`,
            schema: `https://ucp.dev/${ucpVersion}/schemas/shopping/order.json`,
          },
        ],
        'dev.ucp.common.identity_linking': [
          {
            version: ucpVersion,
            spec: `https://ucp.dev/${ucpVersion}/specification/identity-linking/`,
            schema: `${base}/.well-known/oauth-authorization-server`,
            config: {
              scopes: {
                'dev.ucp.shopping.order:read': {},
                'dev.ucp.shopping.order:manage': {},
              },
            },
          },
        ],
      },
      payment_handlers: {},
    },
  }
}

function apiCatalog() {
  const base = originBase()
  const entry = (anchor: string) => ({
    anchor: `${base}${anchor}`,
    'service-desc': [{ href: `${base}${anchor}/manifest`, type: 'application/json' }],
    'service-doc': [{ href: `${base}/`, type: 'text/html' }],
    status: [{ href: `${base}/api/config`, type: 'application/json' }],
  })
  return {
    linkset: [
      entry('/api/content'),
      entry('/api/config'),
      entry('/api/releases'),
      entry('/api/gallery'),
      entry('/api/video'),
      entry('/api/radio'),
      entry('/api/social'),
    ],
  }
}

function dnsAid() {
  const base = originBase()
  const hostname = new URL(base).hostname
  return {
    version: 'draft-mozleywilliams-dnsop-dnsaid-00',
    origin: base,
    dns_zone: hostname,
    records: [
      {
        name: `_index._agents.${hostname}.`,
        type: 'SVCB',
        params: {
          priority: 1,
          target: '.',
          alpn: 'h2,h3',
          port: 443,
          endpoint: base,
          description: 'D7TUN6 artist platform — agent discovery index',
          skills: `${base}/.well-known/agent-skills/index.json`,
        },
      },
      {
        name: `_a2a._agents.${hostname}.`,
        type: 'SVCB',
        params: {
          priority: 1,
          target: '.',
          alpn: 'h2,h3',
          port: 443,
          endpoint: base,
        },
      },
    ],
    dnssec_recommended: true,
    note: 'Add these SVCB records to your DNS zone and enable DNSSEC.',
  }
}

function agentSkillsIndex() {
  const base = originBase()
  const skills = [
    {
      name: 'robots-txt',
      type: 'agent-resource',
      description: 'Crawl rules for AI agents and content signals preferences',
      url: `${base}/robots.txt`,
      sha256: sha256Hex('User-agent: GPTBot\nDisallow: /api/\nAllow: /\n'),
    },
    {
      name: 'sitemap',
      type: 'agent-resource',
      description: 'Canonical URL index with hreflang alternate links for bilingual content',
      url: `${base}/sitemap.xml`,
      sha256: sha256Hex('<?xml version="1.0" encoding="UTF-8"?>\n<urlset'),
    },
    {
      name: 'agent-auth',
      type: 'agent-protocol',
      description: 'Agentic registration, identity claim, and token exchange via OAuth 2.0',
      url: `${base}/auth.md`,
    },
    {
      name: 'webmcp',
      type: 'agent-api',
      description: 'In-browser tool definitions for AI agents via WebMCP',
      url: `${base}/.well-known/mcp/server-card.json`,
    },
    {
      name: 'openapi',
      type: 'agent-api',
      description: 'OpenAPI 3.1 specification with MPP payment extensions',
      url: `${base}/openapi.json`,
    },
    {
      name: 'api-catalog',
      type: 'agent-resource',
      description: 'RFC 9727 linkset catalog of all API services',
      url: `${base}/.well-known/api-catalog`,
    },
    {
      name: 'oauth-authorization-server',
      type: 'agent-protocol',
      description: 'OAuth 2.0 Authorization Server metadata with agent_auth extensions',
      url: `${base}/.well-known/oauth-authorization-server`,
    },
    {
      name: 'agentic-commerce',
      type: 'agent-protocol',
      description: 'Agentic Commerce Protocol (ACP) support',
      url: `${base}/.well-known/acp.json`,
    },
    {
      name: 'universal-commerce-protocol',
      type: 'agent-protocol',
      description: 'UCP profile for shopping services — catalog, checkout, orders',
      url: `${base}/.well-known/ucp`,
    },
    {
      name: 'x402-payments',
      type: 'agent-payment',
      description: 'HTTP 402 payment middleware for AI agents (Base stablecoin)',
      url: `${base}/openapi.json`,
    },
    {
      name: 'mpp-payments',
      type: 'agent-payment',
      description: 'Machine Payment Protocol via OpenAPI x-payment-info extensions',
      url: `${base}/openapi.json`,
    },
    {
      name: 'http-message-signatures',
      type: 'agent-protocol',
      description: 'HTTP Message Signatures directory for agent authentication',
      url: `${base}/.well-known/http-message-signatures-directory`,
    },
  ]
  return {
    $schema: 'https://agentskills.io/schemas/skills-index.json',
    source: base,
    description: 'D7TUN6 artist platform — music, gallery, video, radio, shop, and CMS',
    skills,
  }
}

export function addDiscoveryConfigRoutes(app: Elysia) {
  return app
    .get('/acp.json', corsJsonHandler(acpConfig(), 3600))
    .get('/mcp/server-card.json', corsJsonHandler(mcpServerCard(), 3600))
    .get('/ucp', corsJsonHandler(ucpProfile(), 86400))
    .get('/api-catalog', ({ set }) => {
      set.headers['content-type'] = 'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"'
      set.headers['cache-control'] = 'max-age=86400'
      return apiCatalog()
    })
    .get('/dns-aid', corsJsonHandler(dnsAid(), 3600))
    .get('/agent-skills/index.json', corsJsonHandler(agentSkillsIndex(), 3600))
}
