import type { Elysia } from 'elysia'
import { jsonHandler } from './json-handler.js'

function corsJsonHandler(data: object, maxAge = 3600) {
  const h = jsonHandler(data, maxAge)
  return ({ set }: { set: { headers: Record<string, unknown> } }) => {
    set.headers['access-control-allow-methods'] = 'GET'
    set.headers['access-control-allow-headers'] = 'Content-Type'
    return h({ set })
  }
}

function x402Config() {
  const walletAddress = process.env.WALLET_ADDRESS || null
  return {
    protocol: 'x402',
    version: '2.15.0',
    documentation_url: 'https://x402.org',
    facilitator_url: process.env.FACILITATOR_URL || 'https://api.facilitator.x402.org/v1',
    wallet_address: walletAddress,
    configured: Boolean(walletAddress),
    supported_networks: ['eip155:8453'],
    supported_schemes: ['exact'],
    protected_routes: [
      {
        method: 'POST',
        path: '/api/download/prepare',
        description: 'Pay to prepare audio download',
        accepts: {
          scheme: 'exact',
          network: 'eip155:8453',
          price: '0.01',
        },
      },
    ],
  }
}

function mcpTools() {
  return {
    tools: [
      {
        name: 'search-releases',
        description: 'Search music releases by query, year, or tag',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Free text search' },
            year: { type: 'number', description: 'Filter by year' },
            tag: { type: 'string', enum: ['LP', 'EP', 'Single', 'Remaster', 'Compilation', 'Demo', 'Live'] },
            limit: { type: 'number', default: 20 },
          },
        },
      },
      {
        name: 'get-release',
        description: 'Get detailed release info by slug',
        inputSchema: { type: 'object', properties: { slug: { type: 'string' } }, required: ['slug'] },
      },
      {
        name: 'list-gallery',
        description: 'List gallery entries',
        inputSchema: { type: 'object', properties: { limit: { type: 'number', default: 50 } } },
      },
      {
        name: 'list-videos',
        description: 'List video entries',
        inputSchema: { type: 'object', properties: { limit: { type: 'number', default: 50 } } },
      },
      {
        name: 'get-radio-state',
        description: 'Get current radio state',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'get-radio-tracks',
        description: 'Get radio track list',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'get-content',
        description: 'Browse CMS content',
        inputSchema: { type: 'object', properties: { type: { type: 'string' }, limit: { type: 'number', default: 20 } } },
      },
      {
        name: 'get-site-config',
        description: 'Get site configuration',
        inputSchema: { type: 'object', properties: {} },
      },
    ],
  }
}

export function addPaymentsConfigRoutes(app: Elysia) {
  return app
    .get('/x402', corsJsonHandler(x402Config(), 3600))
    .get('/mcp/tools', corsJsonHandler(mcpTools(), 300))
}
