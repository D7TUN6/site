export function generateOpenApi(baseUrl: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'D7TUN6 API',
      version: '1.0.0',
      description: 'Artist platform API for music releases, downloads, and merchandise',
    },
    servers: [{ url: baseUrl }],
    'x-service-info': {
      categories: ['media', 'social', 'commerce', 'music'],
      docs: {
        homepage: baseUrl,
        apiReference: `${baseUrl}/.well-known/api-catalog`,
        llms: `${baseUrl}/auth.md`,
      },
    },
    paths: {
      '/api/config': {
        get: {
          summary: 'Site configuration',
          operationId: 'getConfig',
          responses: {
            '200': { description: 'Site config with features, banners, and payment provider settings' },
          },
        },
      },
      '/api/releases/manifest': {
        get: {
          summary: 'Release manifest',
          operationId: 'getReleaseManifest',
          responses: {
            '200': { description: 'Full release manifest with all releases, tracks, and metadata' },
          },
        },
      },
      '/api/download/prepare': {
        post: {
          summary: 'Prepare audio download',
          operationId: 'prepareDownload',
          'x-payment-info': {
            offers: [
              {
                intent: 'charge',
                method: 'tempo',
                amount: '1',
                currency: 'usd',
                description: 'One-time stablecoin charge per audio download preparation',
              },
            ],
          },
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['slug', 'format'],
                  properties: {
                    slug: { type: 'string', description: 'Release slug' },
                    track: { type: 'number', description: 'Track index (optional, prepares full release if omitted)' },
                    format: { type: 'string', enum: ['wav', 'flac', 'aiff', 'alac', 'mp3', 'ogg', 'opus', 'wavpack'] },
                    sampleRate: { type: 'number', default: 44100 },
                    bitDepth: { type: 'number', enum: [16, 24, 32], default: 16 },
                    channels: { type: 'number', enum: [1, 2], default: 2 },
                    bitrate: { type: 'number', default: 320 },
                    bitrateMode: { type: 'string', enum: ['vbr', 'cbr'], default: 'vbr' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Download job created' },
            '400': { description: 'Invalid request parameters' },
            '402': { description: 'Payment Required' },
          },
        },
      },
      '/api/releases/download/job/{jobId}': {
        get: {
          summary: 'Download prepared file',
          operationId: 'getDownload',
          parameters: [
            { name: 'jobId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': { description: 'File download' },
            '202': { description: 'Job still processing' },
            '404': { description: 'Job not found' },
          },
        },
      },
      '/api/orders': {
        post: {
          summary: 'Create order',
          operationId: 'createOrder',
          'x-payment-info': {
            offers: [
              {
                intent: 'charge',
                method: 'stripe',
                amount: null,
                currency: 'usd',
                description: 'Variable price based on cart contents',
              },
              {
                intent: 'charge',
                method: 'card',
                amount: null,
                currency: 'usd',
                description: 'Variable price based on cart contents',
              },
            ],
          },
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['items'],
                  properties: {
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        required: ['slug', 'unitAmount', 'quantity'],
                        properties: {
                          slug: { type: 'string' },
                          title: { type: 'string' },
                          unitAmount: { type: 'number', description: 'Price in minor units (cents)' },
                          quantity: { type: 'number', minimum: 1 },
                        },
                      },
                    },
                    shippingProvider: { type: 'string' },
                    comment: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Order created' },
            '400': { description: 'Invalid request' },
            '402': { description: 'Payment Required' },
          },
        },
      },
      '/api/orders/mine': {
        get: {
          summary: 'List user orders',
          operationId: 'listOrders',
          responses: {
            '200': { description: 'User orders list' },
          },
        },
      },
      '/api/shipping': {
        get: {
          summary: 'Shipping options',
          operationId: 'getShippingOptions',
          responses: {
            '200': { description: 'Available shipping providers and rates' },
          },
        },
      },
      '/api/gallery': {
        get: {
          summary: 'Gallery entries',
          operationId: 'listGallery',
          responses: {
            '200': { description: 'Gallery entries list' },
          },
        },
      },
      '/api/video': {
        get: {
          summary: 'Video entries',
          operationId: 'listVideos',
          responses: {
            '200': { description: 'Video entries list' },
          },
        },
      },
      '/api/radio': {
        get: {
          summary: 'Radio stream status',
          operationId: 'getRadioStatus',
          responses: {
            '200': { description: 'Radio stream info and current track' },
          },
        },
      },
      '/api/social': {
        get: {
          summary: 'Social links',
          operationId: 'getSocialLinks',
          responses: {
            '200': { description: 'Social media links and profiles' },
          },
        },
      },
      '/api/content/manifest': {
        get: {
          summary: 'Content manifest',
          operationId: 'getContentManifest',
          responses: {
            '200': { description: 'Content manifest with pages and articles' },
          },
        },
      },
    },
  }
}
